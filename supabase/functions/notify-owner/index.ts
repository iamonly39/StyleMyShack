import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const OWNER_EMAIL = 'iamonly39@gmail.com';

function formatRoomName(roomId: string | null): string {
  if (!roomId) return 'Project (no specific room)';
  return roomId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

serve(async (req) => {
  try {
    const payload = await req.json();

    if (payload.type !== 'INSERT') {
      return new Response('OK', { status: 200 });
    }

    const record = payload.record;
    const builder = record.uploaded_by || 'Unknown builder';
    const caption = record.caption?.trim() || '(no caption)';
    const room = formatRoomName(record.room_id);
    const date = new Date(record.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'StyleMyShack <onboarding@resend.dev>',
        to: [OWNER_EMAIL],
        subject: `New builder update — ${room}`,
        html: `
          <h2 style="font-family:sans-serif;color:#3d2b1f;">New Builder Update</h2>
          <table style="font-family:sans-serif;font-size:15px;color:#3d2b1f;border-collapse:collapse;">
            <tr><td style="padding:4px 12px 4px 0;font-weight:600;">From</td><td>${builder}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Room</td><td>${room}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Caption</td><td>${caption}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Date</td><td>${date}</td></tr>
          </table>
          <p style="font-family:sans-serif;font-size:13px;color:#888;margin-top:24px;">
            Log in to StyleMyShack to view the photo.
          </p>
        `,
      }),
    });

    if (!res.ok) {
      console.error('Resend error:', await res.text());
      return new Response('Email failed', { status: 500 });
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Function error:', err);
    return new Response('Error', { status: 500 });
  }
});
