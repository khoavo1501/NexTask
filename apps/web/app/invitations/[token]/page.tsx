import { AcceptInvitation } from '../../../features/invitations/accept-invitation';

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInvitation token={token} />;
}
