import { BoardWorkspace } from '../../../features/workspace/board-workspace';

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  return <BoardWorkspace boardId={boardId} />;
}
