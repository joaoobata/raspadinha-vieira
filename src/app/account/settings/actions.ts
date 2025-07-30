
'use server';

import { auth, db } from '@/lib/firebase';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin-init';
import { updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

interface ProfileData {
  fullName: string;
  email: string;
}

export async function updateUserProfile(data: ProfileData): Promise<{ success: boolean; error?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Usuário não autenticado.');
    }

    // Update Firebase Auth profile
    await updateProfile(user, {
      displayName: data.fullName,
      // Note: Updating email directly on the client SDK is not simple and requires verification.
      // For this implementation, we will focus on updating the display name and our own DB.
      // A full email update would typically involve sending a verification link.
    });

    // Update Firestore document
    const userRef = doc(db, 'users', user.uid);
    const [firstName, ...lastNameParts] = data.fullName.split(' ');
    const lastName = lastNameParts.join(' ');
    
    await setDoc(userRef, {
      firstName,
      lastName,
      email: data.email, // Assuming we allow email change in our DB
    }, { merge: true });

    return { success: true };

  } catch (error: any) {
    console.error("Error updating user profile:", error);
    return { success: false, error: error.message || "Falha ao atualizar o perfil." };
  }
}


export async function updateUserPassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
        const user = auth.currentUser;
        if (!user || !user.email) {
            throw new Error('Usuário não autenticado ou sem e-mail associado.');
        }

        // Re-authenticate the user to confirm their identity
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);

        // If re-authentication is successful, update the password
        await updatePassword(user, newPassword);

        return { success: true };

    } catch (error: any) {
        console.error("Error updating user password:", error);
        let errorMessage = "Falha ao atualizar a senha.";
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'A senha atual informada está incorreta.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Muitas tentativas. Tente novamente mais tarde.';
        }
        return { success: false, error: errorMessage };
    }
}
