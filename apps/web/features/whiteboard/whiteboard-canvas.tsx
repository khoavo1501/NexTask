'use client';

import type { ItemDto, SyncDeletedItemInput, SyncItemInput } from '@nextask/contracts';
import {
  DefaultColorStyle,
  Tldraw,
  type Editor,
  type TLEventInfo,
  type TLDefaultColorStyle,
  type TLNoteShape,
  type TLNoteShapeProps,
  type TLShapeId,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiClientError, getItems, isVersionConflict, syncItems } from '../../lib/api';
import type { WhiteboardProps } from './whiteboard';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type NoteColor = Extract<TLDefaultColorStyle, 'yellow' | 'blue' | 'green' | 'red'>;

const noteColors: Array<{ value: NoteColor; className: string; label: string }> = [
  { value: 'yellow', className: 'bg-amber-300', label: 'Vàng' },
  { value: 'blue', className: 'bg-sky-300', label: 'Xanh dương' },
  { value: 'green', className: 'bg-emerald-300', label: 'Xanh lá' },
  { value: 'red', className: 'bg-rose-300', label: 'Đỏ' },
];

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'Không đồng bộ được whiteboard với API.';
}

export function WhiteboardCanvas({
  board,
  initialItems,
  items,
  tasks,
  onItemsChange,
  onPromoteRequest,
}: WhiteboardProps) {
  const initialItemsRef = useRef(initialItems);
  const knownItemsRef = useRef(
    new Map(
      initialItems.map((item) => [
        item.shapeId,
        { version: item.version, promotedTaskId: item.promotedTaskId },
      ]),
    ),
  );
  const editorRef = useRef<Editor | null>(null);
  const initializedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveChainRef = useRef<Promise<ItemDto[]>>(Promise.resolve([]));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [currentTool, setCurrentTool] = useState('select');
  const [activeColor, setActiveColor] = useState<NoteColor>('yellow');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [versionNotice, setVersionNotice] = useState<string | null>(null);
  const [, forceViewport] = useReducer((value: number) => value + 1, 0);

  useEffect(() => {
    const known = knownItemsRef.current;
    for (const item of items) {
      const entry = known.get(item.shapeId);
      if (entry && item.version >= entry.version) {
        known.set(item.shapeId, {
          version: item.version,
          promotedTaskId: item.promotedTaskId,
        });
      }
    }
  }, [items]);

  const sendSync = useCallback(
    async (payload: SyncItemInput[], deleted: SyncDeletedItemInput[]): Promise<ItemDto[]> => {
      try {
        return await syncItems(board._id, payload, deleted);
      } catch (caught) {
        if (!isVersionConflict(caught)) throw caught;

        const serverItems = await getItems(board._id);
        const serverByShapeId = new Map(serverItems.map((item) => [item.shapeId, item]));
        const missing: string[] = [];

        for (const entry of payload) {
          const item = serverByShapeId.get(entry.shapeId);
          if (item) {
            knownItemsRef.current.set(entry.shapeId, {
              version: item.version,
              promotedTaskId: item.promotedTaskId,
            });
          } else if (entry.expectedVersion > 0) {
            missing.push(entry.shapeId);
          }
        }

        for (const entry of deleted) {
          const item = serverByShapeId.get(entry.shapeId);
          if (item) {
            knownItemsRef.current.set(entry.shapeId, {
              version: item.version,
              promotedTaskId: item.promotedTaskId,
            });
          } else {
            knownItemsRef.current.delete(entry.shapeId);
          }
        }

        if (missing.length > 0) throw caught;

        const retryPayload = payload.map((entry) => ({
          ...entry,
          expectedVersion: knownItemsRef.current.get(entry.shapeId)?.version ?? 0,
        }));
        const retryDeleted = deleted
          .filter((entry) => knownItemsRef.current.has(entry.shapeId))
          .map((entry) => ({
            ...entry,
            expectedVersion:
              knownItemsRef.current.get(entry.shapeId)?.version ?? entry.expectedVersion,
          }));

        setVersionNotice('Board vừa thay đổi từ tab khác; đã đồng bộ lại.');
        return syncItems(board._id, retryPayload, retryDeleted);
      }
    },
    [board._id],
  );

  const syncNow = useCallback(async (): Promise<ItemDto[]> => {
    const currentEditor = editorRef.current;
    if (!currentEditor || !initializedRef.current) return [];

    const run = saveChainRef.current
      .catch(() => [])
      .then(async () => {
        const shapes = currentEditor
          .getCurrentPageShapes()
          .filter((shape): shape is TLNoteShape => shape.type === 'note');

        const known = knownItemsRef.current;
        const localShapeIds = new Set<string>(shapes.map((shape) => shape.id));
        const payload: SyncItemInput[] = shapes.map((shape) => {
          const bounds = currentEditor.getShapePageBounds(shape);
          const props = shape.props as TLNoteShapeProps;
          return {
            shapeId: shape.id,
            type: 'note' as const,
            content: currentEditor.getShapeUtil(shape).getText(shape) ?? '',
            style: {
              color: props.color,
              size: props.size,
              font: props.font,
              align: props.align,
            } as Record<string, unknown>,
            props: props as unknown as Record<string, unknown>,
            position: { x: shape.x, y: shape.y },
            size: { w: bounds?.w ?? 200, h: bounds?.h ?? 200 },
            rotation: shape.rotation,
            tldrawIndex: String(shape.index),
            parentFrameId: null,
            expectedVersion: known.get(shape.id)?.version ?? 0,
          };
        });
        const deleted: SyncDeletedItemInput[] = [...known.entries()]
          .filter(
            ([shapeId, entry]) => !localShapeIds.has(shapeId) && entry.promotedTaskId === null,
          )
          .map(([shapeId, entry]) => ({
            shapeId,
            expectedVersion: entry.version,
          }));

        setSaveState('saving');
        setError(null);
        try {
          const saved = await sendSync(payload, deleted);
          const savedByShapeId = new Map(saved.map((item) => [item.shapeId, item]));

          for (const shapeId of localShapeIds) {
            const savedItem = savedByShapeId.get(shapeId);
            if (savedItem) {
              known.set(shapeId, {
                version: savedItem.version,
                promotedTaskId: savedItem.promotedTaskId,
              });
            }
          }
          for (const shapeId of [...known.keys()]) {
            const entry = known.get(shapeId);
            if (!entry) continue;
            if (!localShapeIds.has(shapeId) && entry.promotedTaskId === null) {
              known.delete(shapeId);
            }
          }

          onItemsChange(saved);
          setSaveState('saved');
          return saved;
        } catch (caught) {
          setSaveState('error');
          setError(errorMessage(caught));
          return [];
        }
      });

    saveChainRef.current = run;
    return run;
  }, [onItemsChange, sendSync]);

  const scheduleSave = useCallback(
    (delay: number) => {
      if (!initializedRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void syncNow();
      }, delay);
    },
    [syncNow],
  );

  const handleMount = useCallback((mountedEditor: Editor) => {
    editorRef.current = mountedEditor;
    setEditor(mountedEditor);

    try {
      if (initialItemsRef.current.length > 0) {
        mountedEditor.createShapes(
          initialItemsRef.current.map((item) => ({
            id: item.shapeId as TLShapeId,
            type: 'note',
            x: item.position.x,
            y: item.position.y,
            rotation: item.rotation,
            index: item.tldrawIndex as TLNoteShape['index'],
            props: item.props as unknown as TLNoteShapeProps,
          })),
        );
        mountedEditor.zoomToFit({ animation: { duration: 0 } });
      }
      mountedEditor.selectNone();
      mountedEditor.setCurrentTool('select');
      setCurrentTool('select');
      setSaveState('saved');
    } catch {
      setSaveState('error');
      setError('Không dựng lại được các ghi chú trên whiteboard.');
    }

    initializedRef.current = true;

    return () => {
      initializedRef.current = false;
      editorRef.current = null;
      setEditor(null);
    };
  }, []);

  useEffect(() => {
    if (!editor) return;

    let lastViewportUpdate = 0;
    const updateSelection = () => {
      const noteId = editor
        .getSelectedShapeIds()
        .find((shapeId) => editor.getShape(shapeId)?.type === 'note');
      setSelectedShapeId(noteId ?? null);
      setCurrentTool(editor.getCurrentToolId());
    };

    updateSelection();

    const unlistenStore = editor.store.listen(
      () => {
        if (!initializedRef.current) return;
        updateSelection();
        scheduleSave(900);
      },
      { scope: 'document', source: 'all' },
    );

    const handleEvent = (info: TLEventInfo) => {
      updateSelection();
      if (info.type === 'pointer' && info.name === 'pointer_up') {
        scheduleSave(80);
      }
    };

    const handleFrame = () => {
      const now = performance.now();
      if (now - lastViewportUpdate < 80) return;
      lastViewportUpdate = now;
      updateSelection();
      forceViewport();
    };

    editor.on('event', handleEvent);
    editor.on('frame', handleFrame);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      unlistenStore();
      editor.off('event', handleEvent);
      editor.off('frame', handleFrame);
    };
  }, [editor, scheduleSave]);

  function selectTool(tool: 'select' | 'hand' | 'note') {
    editor?.setCurrentTool(tool);
    setCurrentTool(tool);
  }

  function setColor(color: NoteColor) {
    setActiveColor(color);
    editor?.setStyleForNextShapes(DefaultColorStyle, color);
    if (editor && editor.getSelectedShapeIds().length > 0) {
      editor.setStyleForSelectedShapes(DefaultColorStyle, color);
    }
  }

  const selectedItem = selectedShapeId
    ? items.find((item) => item.shapeId === selectedShapeId)
    : null;
  const selectedTask = selectedItem?.promotedTaskId
    ? tasks.find((task) => task._id === selectedItem.promotedTaskId)
    : null;

  async function handlePromoteClick() {
    if (!selectedShapeId) return;
    setError(null);
    const saved = await syncNow();
    const item = saved.find((entry) => entry.shapeId === selectedShapeId);
    if (!item) {
      setError('Chưa đồng bộ được ghi chú để promote.');
      return;
    }
    if (item.promotedTaskId) return;
    onPromoteRequest(item);
  }

  const promotedBadges = items.flatMap((item) => {
    if (!editor || !item.promotedTaskId) return [];
    const task = tasks.find((entry) => entry._id === item.promotedTaskId);
    if (!task) return [];

    const shape = editor.getShape(item.shapeId as TLShapeId);
    const bounds = shape ? editor.getShapePageBounds(shape) : undefined;
    if (!shape || shape.type !== 'note' || !bounds) return [];

    const topLeft = editor.pageToViewport({ x: bounds.x, y: bounds.y });
    const bottomRight = editor.pageToViewport({ x: bounds.x + bounds.w, y: bounds.y + bounds.h });
    const columnName =
      board.columns.find((column) => column.id === task.columnId)?.name ?? task.columnId;
    const assignee = task.assigneeId
      ? task.assigneeId === board.ownerId
        ? 'Demo User'
        : 'Thành viên'
      : null;

    return [
      {
        id: item._id,
        left: topLeft.x + 8,
        top: bottomRight.y - 30,
        text: `Đã thành task · ${columnName}${assignee ? ` · ${assignee}` : ''}`,
      },
    ];
  });

  const saveLabel =
    saveState === 'saving'
      ? 'Đang lưu...'
      : saveState === 'error'
        ? 'Lưu thất bại'
        : saveState === 'saved'
          ? 'Đã lưu'
          : 'Sẵn sàng';

  return (
    <div className="relative h-full w-full overflow-hidden bg-stone-50">
      <Tldraw hideUi onMount={handleMount} />

      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
        {promotedBadges.map((badge) => (
          <span
            key={badge.id}
            className="absolute rounded-full bg-emerald-600/95 px-2 py-1 text-[11px] font-medium text-white shadow-sm"
            style={{ left: badge.left, top: badge.top }}
          >
            {badge.text}
          </span>
        ))}
      </div>

      <div className="absolute left-3 top-3 z-30 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-1 rounded-xl border border-stone-200 bg-white/95 p-1.5 shadow-md backdrop-blur">
        {(
          [
            ['select', 'Chọn'],
            ['hand', 'Kéo'],
            ['note', 'Note'],
          ] as const
        ).map(([tool, label]) => (
          <button
            key={tool}
            type="button"
            onClick={() => selectTool(tool)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              currentTool === tool ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {label}
          </button>
        ))}

        <span className="mx-1 h-5 w-px bg-stone-200" aria-hidden="true" />

        {noteColors.map((color) => (
          <button
            key={color.value}
            type="button"
            title={`Màu ${color.label}`}
            aria-label={`Màu ${color.label}`}
            onClick={() => setColor(color.value)}
            className={`size-6 rounded-full border-2 ${color.className} ${
              activeColor === color.value ? 'border-stone-800' : 'border-white'
            }`}
          />
        ))}

        <span className="mx-1 h-5 w-px bg-stone-200" aria-hidden="true" />

        <button
          type="button"
          onClick={() => editor?.zoomOut()}
          className="rounded-lg px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
          aria-label="Thu nhỏ"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => editor?.zoomIn()}
          className="rounded-lg px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
          aria-label="Phóng to"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => editor?.zoomToFit()}
          className="rounded-lg px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
        >
          Fit
        </button>
        <button
          type="button"
          onClick={() => void syncNow()}
          className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-200"
        >
          Lưu
        </button>
        <span
          className={`px-1 text-[11px] ${
            saveState === 'error' ? 'text-rose-600' : 'text-stone-500'
          }`}
        >
          {saveLabel}
        </span>
        {versionNotice ? (
          <span className="px-1 text-[11px] text-amber-700">{versionNotice}</span>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="absolute right-3 top-16 z-30 max-w-sm rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          {error}
        </p>
      ) : null}

      <div className="absolute bottom-3 left-3 z-30 w-full max-w-xs">
        {selectedShapeId ? (
          <div className="rounded-xl border border-stone-200 bg-white/95 p-3 shadow-md backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              Ghi chú đang chọn
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-stone-900">
              {selectedItem?.content.trim() || 'Ghi chú mới chưa có nội dung'}
            </p>
            {selectedTask ? (
              <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                Đã thành task ·{' '}
                {board.columns.find((column) => column.id === selectedTask.columnId)?.name ??
                  selectedTask.columnId}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void handlePromoteClick()}
                className="mt-3 w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                Promote thành task
              </button>
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-stone-200 bg-white/90 px-3 py-2 text-xs text-stone-500 shadow-sm">
            Chọn một note để promote.
          </p>
        )}
      </div>
    </div>
  );
}
