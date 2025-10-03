// --- O CÉBRO DO CONECTOR (VERSÃO 8.2 - CORREÇÃO DE LINK) ---
import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';

// Inicializa a conexão com a base de dados de memória
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Carrega o dossier de inteligência do negócio
const dossierPath = path.resolve(process.cwd(), 'dossier_negocio.txt');
const DOSSIER_INTELIGENCIA = fs.readFileSync(dossierPath, 'utf-8');
const LINHA_DE_SUPORTE = "+244 9XX XXX XXX"; // Insira aqui o número correto

export const handler = async (event) => {
  // --- PASSO 0: Extrair chaves secretas ---
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // --- PASSO 1: Verificação do Webhook ---
  if (event.httpMethod === 'GET') {
    const queryParams = event.queryStringParameters;
    const mode = queryParams['hub.mode'];
    const challenge = queryParams['hub.challenge'];
    const token = queryParams['hub.verify_token'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return { statusCode: 200, body: challenge };
    } else {
      return { statusCode: 403, body: 'Falha na verificação' };
    }
  }

  // --- PASSO 2: Processar Mensagens ---
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const message = body.entry[0].changes[0].value.messages[0];
        if (message.type !== 'text') {
            return { statusCode: 200, body: 'OK' };
        }
        const userPhoneNumber = message.from;
        const userMessage = message.text.body;
        const waBusinessPhoneId = body.entry[0].changes[0].value.metadata.phone_number_id;
        
        let userData = await redis.get(userPhoneNumber) || { status: 'NOVO_CLIENTE', history: [] };
        if (!Array.isArray(userData.history)) {
            userData.history = [];
        }
        const isNewClient = userData.status === 'NOVO_CLIENTE';

        // --- SYSTEM PROMPT (VERSÃO 8.2 - CORREÇÃO DE LINK) ---
        const systemPrompt = `
### PAPEL ###
Atue como 'André', um assistente comercial autónomo, especialista e amigável da Nutrimacho. A sua missão é usar o dossier de inteligência fornecido para responder a todas as perguntas e guiar o cliente ativamente pelo funil de vendas até à página de encomenda.

### CONTEXTO ###
- **Estado do Cliente:** O cliente atual é ${isNewClient ? 'um novo contacto' : 'um cliente que retorna'}. Adapte o seu tom em conformidade.
- **O Dossier de Inteligência:** Abaixo está todo o conhecimento que você possui sobre a empresa e o produto. Baseie TODAS as suas respostas estritamente nesta informação.

\`\`\`dossier
${DOSSIER_INTELIGENCIA}
\`\`\`

### COMANDO ###
A sua tarefa é analisar a mensagem do cliente e o histórico da conversa para decidir a melhor ação seguinte, de acordo com as seguintes diretivas:

1.  **Primeiro Contacto (Status: NOVO_CLIENTE):**
    - Apresente-se calorosamente como 'André' da Nutrimacho.
    - O seu objetivo é entender a necessidade do cliente e responder às suas primeiras perguntas usando o dossier.

2.  **Responder a Perguntas:**
    - Quando um cliente fizer uma pergunta, procure a resposta EXATA no dossier.
    - **Se a informação NÃO estiver no dossier**, a sua ÚNICA resposta deve ser: "Essa é uma excelente pergunta. Para lhe dar a informação mais precisa, por favor, contacte a nossa linha de suporte ao cliente através do número ${LINHA_DE_SUPORTE} e um dos nossos especialistas terá todo o prazer em ajudar."

3.  **Conduzir o Funil de Vendas (Seu Principal Objetivo):**
    - O seu objetivo final é sempre levar o cliente a encomendar.
    - Quando o cliente expressar interesse em comprar, a sua ÚNICA resposta deve ser o "Guião de Compra".
    - **Guião de Compra (Use esta resposta exata):** "Fico feliz em ajudar com a sua encomenda! O processo é muito simples. Por favor, aceda à nossa página segura através do link https://cha-de-prostata.netlify.app/ , preencha o formulário com os seus dados, e um dos nossos especialistas entrará em contacto para finalizar os detalhes da entrega. É rápido e fácil!"

### FORMATO ###
- **Estilo:** Humano, profissional, confiante e prestável.
- **Língua:** Português de Angola, sem erros.
- **Formatação de Links (MUITO IMPORTANTE):** Ao enviar o link da página, envie APENAS o texto do URL (https://cha-de-prostata.netlify.app/). NUNCA o formate como um link Markdown \`[texto](link)\`.
`;
        
        if (isNewClient) {
            userData.status = 'EM_CONVERSA';
        }
        userData.history.push({ role: "user", content: userMessage });
        if (userData.history.length > 10) {
            userData.history = userData.history.slice(-10);
        }

        let aiResponseText = `Peço desculpa, mas estou com uma dificuldade técnica. Por favor, contacte o nosso suporte através do número ${LINHA_DE_SUPORTE} para assistência imediata.`;
        
        try {
            console.log("A contactar a OpenAI com contexto completo...");
            const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: "gpt-4o",
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...userData.history
                    ]
                })
            });
            const openaiResult = await openaiResponse.json();
            if (openaiResult.choices && openaiResult.choices[0].message.content) {
                aiResponseText = openaiResult.choices[0].message.content.trim();
                userData.history.push({ role: "assistant", content: aiResponseText });
                await redis.set(userPhoneNumber, userData, { ex: 86400 }); 
            } else {
                 console.error("Resposta da OpenAI inválida:", JSON.stringify(openaiResult, null, 2));
            }
        } catch(e) { console.error("Erro ao chamar a OpenAI:", e); }
        
        console.log(`Resposta da IA: "${aiResponseText}"`);
        
        const metaApiResponse = await fetch(`https://graph.facebook.com/v20.0/${waBusinessPhoneId}/messages`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json', },
            body: JSON.stringify({ messaging_product: 'whatsapp', to: userPhoneNumber, text: { body: aiResponseText }, }),
        });
        const metaApiResult = await metaApiResponse.json();
        if (!metaApiResponse.ok) {
            console.error("A API da Meta reportou um erro:", JSON.stringify(metaApiResult, null, 2));
        } else {
            console.log("Resposta sent with success! Meta API response:", JSON.stringify(metaApiResult, null, 2));
        }
        return { statusCode: 200, body: 'OK' };
      } else {
        return { statusCode: 200, body: 'Evento ignorado' };
      }
    } catch (error) {
      console.error('Erro no processamento do webhook:', error);
      return { statusCode: 500, body: 'Erro interno' };
    }
  }
  return { statusCode: 405, body: 'Método não permitido' };
};





