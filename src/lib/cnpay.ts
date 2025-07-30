'use server';

import { getAdminDb } from './firebase-admin-init';
import axios from 'axios';
import https from 'https';

async function getCnPayCredentials() {
    try {
        const adminDb = getAdminDb();
        const gatewayConfigRef = adminDb.collection("settings").doc("gateway");
        const gatewayConfigDoc = await gatewayConfigRef.get();

        if (!gatewayConfigDoc.exists) {
            throw new Error("Configuração do gateway CN Pay não encontrada no Firestore.");
        }
        const data = gatewayConfigDoc.data();
        if (!data) {
             throw new Error("Dados de configuração do gateway CN Pay estão vazios.");
        }
        const { publicKey, secretKey } = data;

        if (!publicKey || !secretKey) {
            throw new Error("As credenciais da CN Pay estão incompletas no Firestore.");
        }
        return { publicKey, secretKey };
    } catch (error) {
        console.error("Erro ao buscar credenciais da CN Pay:", error);
        throw new Error("Não foi possível carregar as credenciais do gateway de pagamento.");
    }
}

// Create an agent that forces requests to use IPv4
const ipv4Agent = new https.Agent({ family: 4 });

async function makeCnPayRequest(endpoint: string, method: 'GET' | 'POST', payload: any = null) {
    const { publicKey, secretKey } = await getCnPayCredentials();
    const url = `https://painel.appcnpay.com/api/v1${endpoint}`;

    const config: import('axios').AxiosRequestConfig = {
        method,
        url,
        headers: {
            'Content-Type': 'application/json',
            'x-public-key': publicKey,
            'x-secret-key': secretKey,
        },
        httpsAgent: ipv4Agent, // Force IPv4 for this request
    };

    if (method === 'POST' && payload) {
        config.data = payload;
    } else if (method === 'GET' && payload) {
        config.params = payload;
    }

    try {
        const response = await axios(config);
        return response.data;
    } catch (error: any) {
        const errorPayload = {
            status: 'ERROR',
            message: `CN Pay API error: ${error.response?.status} ${error.response?.statusText}`,
            errorDescription: error.response?.data?.errorDescription || error.response?.data?.message || JSON.stringify(error.response?.data?.details) || error.message,
            requestUrl: url,
            requestPayload: method === 'POST' ? payload : 'N/A for GET',
        };
        console.error(`CN Pay Error Response (${error.response?.status}) from URL ${url}:`, errorPayload);
        return errorPayload;
    }
}


export async function createPix(payload: any) {
    return makeCnPayRequest('/gateway/pix/receive', 'POST', payload);
}

export async function getTransaction(transactionIdentifier: string) {
    return makeCnPayRequest(`/gateway/transactions?clientIdentifier=${transactionIdentifier}`, 'GET');
}

export async function createTransfer(payload: any) {
    return makeCnPayRequest('/gateway/transfers', 'POST', payload);
}