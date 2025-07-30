
# Plataforma de Raspadinhas - Guia de Configuração (White-Label)

Bem-vindo à documentação técnica da sua plataforma de raspadinhas. Este guia detalha todos os passos necessários para configurar um novo projeto do zero, incluindo a configuração do Firebase, credenciais, índices do banco de dados e outras configurações essenciais.

## 1. Configuração do Projeto Firebase

A plataforma utiliza o Firebase para autenticação, banco de dados (Firestore) e armazenamento de arquivos (Storage).

### 1.1. Crie seu Projeto no Firebase
- Para começar, crie um novo projeto no [console do Firebase](https://console.firebase.google.com/).

### 1.2. Ative o Firestore Database
- No menu do seu projeto, vá para a seção **Construir > Firestore Database** e clique em **Criar banco de dados**.
- Escolha o modo **Produção** quando solicitado e siga o assistente de configuração.

### 1.3. Ative e Configure o Firebase Storage (PASSO CRÍTICO)
- No menu, vá para **Construir > Storage**.
- Clique em **Começar** e siga o assistente. Mantenha o modo **Produção**.
- **Passo Crítico:** Após a criação, vá para a aba **Regras** e substitua o conteúdo pelo seguinte para permitir que as imagens sejam exibidas publicamente:
  ```
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      // Permite que qualquer pessoa leia os arquivos (necessário para exibir imagens)
      match /{allPaths=**} {
        allow read;
        allow write: if request.auth != null; // Apenas usuários autenticados podem escrever
      }
    }
  }
  ```
- Clique em **Publicar**.

---

## 2. Configurações Específicas do Sistema (Segredos e Chaves)

**Este é um passo crucial para colocar seu próprio sistema no ar.** Cada instância da plataforma precisa de suas próprias chaves de API e configurações de ambiente.

### 2.1. Variáveis de Ambiente (Arquivo `.env.local`)

Todas as configurações sensíveis e específicas do ambiente são gerenciadas através de um arquivo `.env.local` na raiz do projeto. Primeiro, copie o arquivo `.env.example` para um novo arquivo chamado `.env.local`.

```bash
cp .env.example .env.local
```

Agora, preencha as variáveis no arquivo `.env.local` com os dados do seu projeto Firebase, seguindo as instruções abaixo.

#### a) URL Base do Site
- **Variável:** `NEXT_PUBLIC_BASE_URL`
- **Onde encontrar:** Esta é a URL principal do seu site em produção (ex: `https://seusite.com`). É crucial para que os webhooks do gateway de pagamento funcionem corretamente.

#### b) Credenciais do Firebase (Lado do Cliente)
- **Variáveis:** Todo o bloco que começa com `NEXT_PUBLIC_FIREBASE_*`.
- **Onde encontrar:**
    1. No console do Firebase, clique no ícone de engrenagem e vá para **Configurações do Projeto**.
    2. Na aba **Geral**, role para baixo até a seção "Seus apps".
    3. Clique no app da Web que você criou (ou crie um se não existir).
    4. Na janela de configuração, escolha a opção **Objeto de configuração**.
    5. Copie cada valor (`apiKey`, `authDomain`, `projectId`, etc.) e cole nas variáveis correspondentes no arquivo `.env.local`.

#### c) Credenciais do Firebase (Servidor)
- **Variáveis:** `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_PRIVATE_KEY`, `FIREBASE_ADMIN_CLIENT_EMAIL`.
- **Onde encontrar:**
    1. No console do Firebase, clique no ícone de engrenagem e vá para **Configurações do Projeto**.
    2. Selecione a aba **Contas de serviço**.
    3. Clique no botão **Gerar nova chave privada**. Um arquivo JSON será baixado.
    4. Abra o arquivo JSON e copie os seguintes valores:
        - `project_id` -> Cole em `FIREBASE_ADMIN_PROJECT_ID`.
        - `private_key` -> Cole **todo o conteúdo**, incluindo `-----BEGIN PRIVATE KEY-----` e `-----END PRIVATE KEY-----`, na variável `FIREBASE_ADMIN_PRIVATE_KEY`.
        - `client_email` -> Cole em `FIREBASE_ADMIN_CLIENT_EMAIL`.

#### d) Nome do Bucket do Firebase Storage
- **Variável:** `FIREBASE_STORAGE_BUCKET` e `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.
- **Onde encontrar:**
    1. No console do Firebase, vá para a seção **Storage**.
    2. Na aba **Arquivos**, você verá o endereço na parte superior, algo como `gs://seu-projeto-12345.appspot.com`.
    3. Copie apenas o nome do bucket (o texto depois de `gs://`, ex: `seu-projeto-12345.appspot.com`).
    4. Cole este mesmo valor nas duas variáveis: `FIREBASE_STORAGE_BUCKET` e `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.

### 2.2. Credenciais do Gateway de Pagamento (CN Pay)
As chaves do gateway de pagamento são gerenciadas pelo painel de administração.
- **O que fazer:**
    1. Acesse o painel de administração da sua plataforma em `/admin/gateway`.
    2. Insira a **Chave Pública (x-public-key)** e a **Chave Secreta (x-secret-key)** fornecidas pelo seu provedor de pagamento.
    3. (Opcional, mas recomendado) Adicione os IPs de webhook do seu gateway para aumentar a segurança.
- Essas configurações são salvas no documento `settings/gateway` no Firestore.

---

## 3. Índices Compostos do Firestore (PASSO CRÍTICO E OBRIGATÓRIO)

Para que as consultas mais complexas da aplicação funcionem, você **PRECISA** criar os seguintes índices compostos no seu Firestore. Sem eles, várias partes do painel de administração e da lógica do usuário irão falhar com erros.

Vá para **Firestore Database > Índices > Composto > Criar índice**.

Crie os seguintes índices **exatamente** como descrito abaixo. Preste atenção na coleção, nos campos e na ordem (ascendente ou descendente).

**Índice 1: Transações por Usuário**
-   **Coleção:** `transactions`
-   **Campos:**
    1.  `userId` (Ascendente)
    2.  `status` (Ascendente)

**Índice 2: Saques por Usuário**
-   **Coleção:** `withdrawals`
-   **Campos:**
    1.  `userId` (Ascendente)
    2.  `status` (Ascendente)

**Índice 3: Ledger por Usuário (Ordenado)**
-   **Coleção:** `user_ledger`
-   **Campos:**
    1.  `userId` (Ascendente)
    2.  `createdAt` (Descendente)

**Índice 4: Logs de Comissão (Ordenado)**
-   **Coleção:** `commissions`
-   **Campos:**
    1.  `createdAt` (Descendente)

**Índice 5: Logs de Admin (Ordenado)**
-   **Coleção:** `admin_logs`
-   **Campos:**
    1.  `timestamp` (Descendente)

**Índice 6: Logs de Erro de Webhook (Ordenado)**
-   **Coleção:** `webhook_errors`
-   **Campos:**
    1.  `createdAt` (Descendente)

**Índice 7: Jogadas por Data (Dashboard)**
-   **Coleção:** `game_plays`
-   **Campos:**
    1.  `createdAt` (Ascendente)
    2.  `lossAmount` (Ascendente)

**Índice 8: Raspadinhas (Ordenado)**
-   **Coleção:** `scratchcards`
-   **Campos:**
    1.  `createdAt` (Descendente)

**Índice 9: Categorias (Ordenado)**
-   **Coleção:** `categories`
-   **Campos:**
    1.  `name` (Ascendente)

**Índice 10: Ledger por Referência (Para evitar duplicidade de saldo)**
-   **Coleção:** `user_ledger`
-   **Campos:**
    1.  `refId` (Ascendente)
    2.  `type` (Ascendente)

**Índice 11: Comissões por Transação (Para evitar pagamento duplicado)**
-   **Coleção:** `commissions`
-   **Campos:**
    1.  `transactionId` (Ascendente)
    2.  `level` (Ascendente)

**Índice 12: Transações por Data (Dashboard)**
-   **Coleção:** `transactions`
-   **Campos:**
    1.  `status` (Ascendente)
    2.  `paidAt` (Ascendente)

**Índice 13: Saques por Data (Dashboard)**
-   **Coleção:** `withdrawals`
-   **Campos:**
    1.  `status` (Ascendente)
    2.  `completedAt` (Ascendente)


A criação desses índices pode levar alguns minutos. O status será exibido como "Construindo" no console do Firebase. A plataforma só funcionará corretamente após todos os índices estarem com o status "Ativado".

Com o projeto Firebase configurado, as chaves de API trocadas e os índices criados, sua plataforma estará totalmente operacional.
