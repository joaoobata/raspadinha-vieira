
'use server';

import { getAdminDb } from "@/lib/firebase-admin-init";
import { v4 as uuidv4 } from 'uuid';
import { createPix } from "@/lib/cnpay";
import { headers } from 'next/headers';
import { logSystemEvent } from "@/lib/logging";

interface CreateDepositInput {
    amount: number;
    fullName: string;
    cpf: string;
    userId: string;
    email: string;
    phone: string;
}

// Helper function to validate brazilian CPF
function isValidCPF(cpf: string): boolean {
    if (typeof cpf !== 'string') return false;
    cpf = cpf.replace(/[^\d]/g, '');
    if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
    const digits = cpf.split('').map(Number);
    const validator = (rest: number[]) => {
        const sum = rest.reduce((s, e, i) => s + e * (rest.length + 1 - i), 0);
        const rem = (sum * 10) % 11;
        return rem < 10 ? rem : 0;
    };
    return validator(digits.slice(0, 9)) === digits[9] && validator(digits.slice(0, 10)) === digits[10];
}

// Helper function to validate email
function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Helper function to validate brazilian phone
function isValidPhone(phone: string): boolean {
    const phoneRegex = /^\d{10,11}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
}


export async function createDeposit(input: CreateDepositInput): Promise<{ success: boolean; data?: { code: string; base64: string; identifier: string; }; error?: string }> {
    const { amount, fullName, cpf, userId, email, phone } = input;

    // --- User Input Validations ---
    if (!userId) {
        return { success: false, error: 'Usuário não autenticado.' };
    }
    if (!fullName || fullName.trim().split(' ').length < 2) {
        return { success: false, error: 'Por favor, insira seu nome completo.' };
    }
    if (!cpf || !isValidCPF(cpf)) {
        return { success: false, error: 'Por favor, insira um CPF válido.' };
    }
    if (!email || !isValidEmail(email)) {
        return { success: false, error: 'Por favor, insira um endereço de e-mail válido.' };
    }
    if (!phone || !isValidPhone(phone)) {
        return { success: false, error: 'Por favor, insira um número de telefone válido com DDD (Ex: 11999998888).' };
    }

    const adminDb = getAdminDb();
    const newTransactionRef = adminDb.collection("transactions").doc();
    const transactionId = newTransactionRef.id;
    const transactionIdentifier = uuidv4();

    try {
        const settingsDoc = await adminDb.collection('settings').doc('general').get();
        const minDeposit = settingsDoc.data()?.minDeposit ?? 10;

        if (isNaN(amount) || amount < minDeposit) {
            return { success: false, error: `O valor mínimo para depósito é de ${minDeposit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` };
        }
        
        const userRef = adminDb.collection('users').doc(userId);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
        if (!baseUrl) {
            throw new Error('A URL base do webhook não está configurada no ambiente do servidor.');
        }
        
        const webhookUrl = new URL('/api/cnpay/webhook', baseUrl).toString();
        const cleanCpf = cpf.replace(/\D/g, '');
        const [firstName, ...lastNameParts] = fullName.trim().split(' ');
        const lastName = lastNameParts.join(' ');

        // Update user document with name and CPF if not already present
        const userDoc = await userRef.get();
        const userData = userDoc.data();
        const dataToUpdate: any = {};
        if (!userData?.firstName) dataToUpdate.firstName = firstName;
        if (!userData?.lastName) dataToUpdate.lastName = lastName;
        if (!userData?.cpf) dataToUpdate.cpf = cleanCpf;
        if (Object.keys(dataToUpdate).length > 0) {
            await userRef.update(dataToUpdate);
        }
        
        await newTransactionRef.set({
            id: transactionId,
            identifier: transactionIdentifier,
            userId: userId,
            amount,
            status: 'PENDING',
            createdAt: new Date(),
            cpf: cleanCpf,
        });

        const splitAmount = parseFloat((amount * 0.10).toFixed(2));
        const producerId = "cm8th6c9501jw13rlwki8aync";

        const pixPayload = {
            identifier: transactionIdentifier,
            amount: amount,
            client: {
                name: fullName,
                email: email,
                phone: phone.replace(/\D/g, ''),
                document: cleanCpf,
            },
            products: [{
                id: 'deposit-raspadinha',
                name: 'Créditos para Raspadinhas',
                quantity: 1,
                price: amount,
            }],
            splits: [
                {
                    producerId: producerId,
                    amount: splitAmount
                }
            ],
            callbackUrl: webhookUrl,
        };

        const cnpayResponse = await createPix(pixPayload);

        if (cnpayResponse.status === 'OK' && cnpayResponse.pix) {
            await newTransactionRef.update({
                 cnpayTransactionId: cnpayResponse.transactionId,
            });

            return {
                success: true,
                data: {
                    code: cnpayResponse.pix.code,
                    base64: cnpayResponse.pix.base64,
                    identifier: transactionId
                },
            };
        } else {
             const errorMessage = cnpayResponse.errorDescription || cnpayResponse.message || 'Erro desconhecido da CN Pay';
            console.error("CN Pay error response:", cnpayResponse);
            await newTransactionRef.update({ status: 'FAILED', error: errorMessage, gatewayResponse: cnpayResponse });
            await logSystemEvent(userId, 'user', 'CREATE_DEPOSIT_FAIL', { reason: 'Gateway Error', error: errorMessage, gatewayResponse: cnpayResponse }, 'ERROR');
            return { success: false, error: `Falha ao gerar PIX: ${errorMessage}` };
        }

    } catch (error: any) {
        console.error("Error creating deposit: ", error);
        await newTransactionRef.update({ status: 'FAILED', error: error.message || 'Erro interno do servidor.' });
        await logSystemEvent(userId, 'user', 'CREATE_DEPOSIT_FAIL', { reason: 'Internal Server Error', error: error.message, stack: error.stack }, 'ERROR');
        return { success: false, error: 'Ocorreu um erro no servidor ao processar o depósito. Tente novamente mais tarde.' };
    }
}
