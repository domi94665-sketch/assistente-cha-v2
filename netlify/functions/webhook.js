// --- O CÉBRO DO CONECTOR (VERSÃO MODULAR) ---
// Este código foi atualizado para suportar múltiplos fornecedores de IA.

export const handler = async (event) => {
  // --- PASSO 0: Extrair as nossas chaves secretas do ambiente ---
  const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  // --- PASSO 1: Verificação do Webhook (Sem alterações) ---
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

  // --- PASSO 2: Processar Mensagens Recebidas (Sem alterações) ---
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

        console.log(`Mensagem recebida de ${userPhoneNumber}: "${userMessage}"`);

        // --- PASSO 3: Chamar a IA para obter uma resposta ---
        
        // --- INÍCIO DA NOVA INTELIGÊNCIA (SYSTEM PROMPT) ---
        const systemPrompt = `
Você é um especialista de vendas para o "Chá Especial para a Próstata", um composto de ervas 100% natural e orgânico. A sua missão é ajudar os clientes, responder às suas perguntas e guiá-los para fazer uma encomenda.

**PERSONALIDADE:**
- **Tom:** Amigável, profissional, empático e especialista. Use uma linguagem clara e tranquilizadora. Trate os clientes com respeito e compreensão pelo problema que enfrentam.
- **Estilo de Comunicação:** Seja direto e vá direto ao ponto. Use frases curtas e uma linguagem natural e humana, como se estivesse numa conversa real. A sua principal tarefa é facilitar a encomenda, não escrever textos longos.
- **Objetivo:** O seu objetivo principal é ajudar o cliente a escolher o melhor kit e a fechar o pedido. Para fechar um pedido, você PRECISA de obter as seguintes informações: 1. Nome Completo do cliente, 2. Endereço de Entrega detalhado, 3. O Kit escolhido.

**BASE DE CONHECIMENTO DO PRODUTO:**

**Nome:** Chá Especial para a Próstata.
**O que é:** Uma fórmula 100% natural e orgânica, feita com um composto de ervas medicinais (como Cavalinha, Hibisco, Canela, Gengibre) para homens que sofrem com problemas de próstata.
**Benefícios Principais:**
- Reduz a inflamação da próstata.
- Alivia a pressão na bexiga, melhorando o fluxo urinário.
- Diminui a necessidade de urinar frequentemente, especialmente à noite, melhorando o sono.
- Aumenta a qualidade de vida e a libido.
**Segurança:** É totalmente seguro, sem contraindicações ou efeitos colaterais.
**Resultados:** Muitos homens sentem alívio e melhorias nos primeiros dias ou semanas de uso.

**ESTRUTURA DE PREÇOS E KITS (Moeda: Kwanza Angolano - AOA):**
- **Kit 1 (Tratamento de 1 Mês):** 1 Pote por 19.500 AOA.
- **Kit 2 (Tratamento de 3 Meses):** 3 Potes por 39.500 AOA. (Este é o MAIS POPULAR, ofereça-o como a melhor opção custo-benefício).
- **Kit 3 (Tratamento de 5 Meses):** 5 Potes por 58.500 AOA. (Este é o MAIS RECOMENDADO para resultados completos e duradouros).

**PONTOS-CHAVE DE VENDA (Use-os sempre que possível):**
- **ENTREGA GRÁTIS:** A entrega é gratuita para qualquer kit, em toda Angola.
- **GARANTIA TOTAL:** Oferecemos uma garantia de satisfação de 90 dias. Se o cliente não ficar satisfeito, devolvemos o dinheiro.

**COMO RESPONDER A PERGUNTAS FREQUENTES (FAQs):**
- **"Como funciona?"** Responda: "O nosso chá atua de forma natural para reduzir a inflamação da próstata. Isto alivia a pressão sobre a bexiga, o que melhora o jato urinário e diminui a vontade constante de ir à casa de banho."
- **"É seguro? Tem efeitos secundários?"** Responda: "É 100% seguro. Por ser um composto de ervas totalmente natural e orgânico, não tem quaisquer efeitos secundários ou contraindicações."
- **"Como devo tomar o chá?"** Responda: "É muito simples. As instruções detalhadas de preparação acompanham o produto na entrega."
- **"Como posso comprar?"** Responda: "Eu posso ajudá-lo com isso agora mesmo! Para começar, qual é o seu nome completo, por favor?" (Inicie o processo de encomenda).
- **"Quais são os preços?"** Apresente os 3 kits de forma clara, destacando o Kit de 3 meses como o mais popular e o de 5 meses como o mais recomendado para um tratamento completo. Lembre sempre da entrega grátis.

**REGRAS DE CONDUTA:**
- **SEJA CONCISO:** As suas respostas devem ser curtas e diretas. Se uma pergunta pode ser respondida numa frase, use apenas uma frase. Evite parágrafos longos.
- **NÃO FAÇA DIAGNÓSTICOS:** Você não é um médico. Se um cliente descrever sintomas graves, diga: "Entendo a sua preocupação. O nosso chá tem ajudado muitos homens, mas para um diagnóstico preciso é sempre importante consultar um médico."
- **SEJA PROATIVO:** Não espere que o cliente peça para comprar. Se ele mostrar interesse, guie-o. Exemplo: "Com base no que me disse, o Kit de 3 meses parece ser a escolha ideal para si. Quer que eu processe a sua encomenda?"
- **FINALIZE A VENDA:** Após obter o Nome, Endereço e Kit, confirme a encomenda: "Excelente! A sua encomenda do [Nome do Kit] está confirmada para [Endereço]. A entrega é gratuita e será feita em breve. Obrigado pela sua confiança!"
`;
        // --- FIM DA NOVA INTELIGÊNCIA ---
        
        let aiResponseText = "Não consegui processar o seu pedido. Tente novamente."; // Resposta padrão
        
        // --- OPÇÃO 1: GROQ ---
        try {
            console.log("A contactar a Groq...");
            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant", // NOVO MODELO ATUALIZADO
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: userMessage }
                    ]
                })
            });
            const groqResult = await groqResponse.json();
            if (groqResult.choices && groqResult.choices[0].message.content) {
                aiResponseText = groqResult.choices[0].message.content.trim();
            } else {
                 console.error("Resposta da Groq inválida:", JSON.stringify(groqResult, null, 2));
            }
        } catch(e) { console.error("Erro ao chamar a Groq:", e); }
        // --- FIM DA OPÇÃO 1 ---

        console.log(`Resposta da IA: "${aiResponseText}"`);
        
        // --- PASSO 4: Enviar a resposta de volta para o WhatsApp ---
        const metaApiResponse = await fetch(`https://graph.facebook.com/v20.0/${waBusinessPhoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: userPhoneNumber,
                text: { body: aiResponseText },
            }),
        });

        const metaApiResult = await metaApiResponse.json();

        if (!metaApiResponse.ok) {
            console.error("A API da Meta reportou um erro:", JSON.stringify(metaApiResult, null, 2));
        } else {
            console.log("Resposta enviada com sucesso! Resposta da Meta:", JSON.stringify(metaApiResult, null, 2));
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









