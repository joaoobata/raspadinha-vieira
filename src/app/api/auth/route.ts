
'use server';

import { getAdminAuth } from '@/lib/firebase-admin-init';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const idToken = body.idToken;

    if (!idToken) {
      return NextResponse.json({ error: 'ID token is required' }, { status: 400 });
    }

    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn });

    cookies().set('__session', sessionCookie, {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Error creating session cookie:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 401 });
  }
}

export async function DELETE() {
  try {
    const sessionCookie = cookies().get('__session')?.value;
    if (sessionCookie) {
      const decodedClaims = await getAdminAuth().verifySessionCookie(sessionCookie);
      await getAdminAuth().revokeRefreshTokens(decodedClaims.sub);
    }
    cookies().delete('__session');
    return NextResponse.json({ status: 'success' });
  } catch (error) {
    console.error('Error revoking session cookie:', error);
    return NextResponse.json({ error: 'Failed to end session' }, { status: 500 });
  }
}
