import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { proxyFetch, proxyJson, proxyStreamChat } from './proxyClient';

function normalizeBaseUrl(url) {
  if (!url) return undefined;
  const base = url.replace(/\/+$/, ''); // strip trailing slashes
  if (base.endsWith('/v1')) return base;
  return `${base}/v1`;
}

const DEFAULT_SYSTEM = `You are a helpful AI Prompt Engineering assistant for Stable Diffusion/Midjourney.
If you suggest tags, put them comma-separated inside <TAGS>...</TAGS>.
If you suggest rewriting the positive prompt, put it inside <REWRITE_POS>...</REWRITE_POS>.
If you suggest rewriting the negative prompt, put it inside <REWRITE_NEG>...</REWRITE_NEG>.
Keep your explanations brief and helpful.`;

// Streaming executor for custom OpenAI-compatible endpoints, routed through
// Tauri's Rust-side HTTP proxy. Mirrors the SDK streaming shape (for-await
// over chunks) so the chat handler can call it without knowing it's proxied.
async function executeOpenAIProxied(payload, useStream, toolHandlers, onChunk, baseURL, apiKey) {
  const url = `${baseURL}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  // Ensure stream: true is set for the proxied path even if the caller toggled it off.
  // (We always stream so the chat UI gets incremental updates; if useStream is
  // false the caller just won't pass onChunk and we'll still complete the call.)
  const proxiedPayload = { ...payload, stream: useStream !== false };

  if (!useStream) {
    // Non-streaming path — single request, single response.
    const res = await proxyFetch({
      url,
      method: 'POST',
      headers,
      body: proxiedPayload,
    });
    const data = JSON.parse(res.body);
    const msg = data.choices?.[0]?.message;
    if (msg?.tool_calls?.length && toolHandlers?.search_tags) {
      const tc = msg.tool_calls[0];
      let args = { prompt: '' };
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch (e) {}
      const result = await toolHandlers.search_tags(args.prompt || '');
      payload.messages.push(msg);
      payload.messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function?.name,
        content: JSON.stringify(result),
      });
      return await executeOpenAIProxied(payload, false, toolHandlers, null, baseURL, apiKey);
    }
    return { text: msg?.content || '', reasoning_content: msg?.reasoning_content };
  }

  // Streaming path — parse SSE ourselves from Tauri event chunks.
  const streamIter = await proxyStreamChat({
    url,
    method: 'POST',
    headers,
    body: proxiedPayload,
  });

  let fullText = '';
  let fullReasoning = '';
  let toolCallArgs = '';
  let toolCallName = '';
  let toolCallId = '';

  try {
    for await (const evt of streamIter) {
      if (!evt || evt.done) continue;
      const chunk = evt.data;
      if (!chunk || typeof chunk !== 'object') continue;
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (!delta) continue;

      if (delta.tool_calls) {
        const tc = delta.tool_calls[0];
        if (tc?.id) toolCallId = tc.id;
        if (tc?.function?.name) toolCallName = tc.function.name;
        if (tc?.function?.arguments) toolCallArgs += tc.function.arguments;
      }
      if (delta.reasoning_content) {
        fullReasoning += delta.reasoning_content;
      }
      if (delta.content) {
        fullText += delta.content;
        if (onChunk) onChunk(fullText);
      }
    }
  } catch (e) {
    if (streamIter?.cancel) await streamIter.cancel();
    throw e;
  }

  if (toolCallName === 'search_tags' && toolHandlers?.search_tags) {
    let args = { prompt: '' };
    try { args = JSON.parse(toolCallArgs); } catch (e) {}
    const result = await toolHandlers.search_tags(args.prompt || '');

    payload.messages.push({
      role: 'assistant',
      content: fullText || null,
      tool_calls: [{
        id: toolCallId,
        type: 'function',
        function: { name: toolCallName, arguments: toolCallArgs },
      }],
    });
    if (fullReasoning) payload.messages[payload.messages.length - 1].reasoning_content = fullReasoning;
    payload.messages.push({
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolCallName,
      content: JSON.stringify(result),
    });

    // Recurse with stream=false so we get the final answer in one shot.
    return await executeOpenAIProxied(payload, false, toolHandlers, onChunk, baseURL, apiKey);
  }

  return { text: fullText, reasoning_content: fullReasoning };
}

export async function sendChatMessage(messages, settings, workspaceContext, onChunk, toolHandlers = null) {
  const { aiProvider, aiApiKey, aiBaseUrl, aiModel, aiStreaming, aiCustomInstructions, aiUseProxy, aiTemperature, aiTopP, aiTopK } = settings;
  // aiUseProxy defaults to true so CORS-restricted endpoints (e.g. Ollama Cloud) work out of the box.
  const useProxy = aiUseProxy !== false;
  
  // Format messages
  const history = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role,
    content: m.content,
    attachments: m.attachments,
    geminiParts: m.geminiParts
  }));
  
  const useStream = aiStreaming !== false && typeof onChunk === 'function';

  // Extract allCategories and process references
  const allCategories = workspaceContext.allCategories || [];
  const resolvedCategoryRefs = workspaceContext.resolvedCategoryRefs || [];
  delete workspaceContext.allCategories;
  delete workspaceContext.resolvedCategoryRefs;

  let categoryContextStr = '';
  if (resolvedCategoryRefs.length > 0) {
    // Authoritative path: the user picked these explicitly via the picker,
    // or they auto-resolved because the name matched a single category.
    const lines = resolvedCategoryRefs.map(r => {
      const tags = (r.tags || []).map(t => typeof t === 'string' ? t : t.name).join(', ');
      const loc = r.folderName ? ` [folder: ${r.folderName}]` : '';
      return `- &${r.categoryName}${loc}: ${tags || '(no tags)'}`;
    });
    categoryContextStr =
      '\n\nThe user explicitly anchored on the following categories via &name references. ' +
      'Treat the tags listed below as canonical for this turn — preserve them exactly unless asked to change:\n' +
      lines.join('\n');
  } else if (allCategories.length > 0) {
    // Fallback: name-match scan against `&Name` tokens in the user's history.
    const userMessagesContent = history.filter(m => m.role === 'user').map(m => m.content).join('\n').toLowerCase();
    const referencedCategories = allCategories.filter(cat =>
       userMessagesContent.includes('&' + cat.name.toLowerCase())
    );

    if (referencedCategories.length > 0) {
       categoryContextStr = '\n\nThe user referenced the following categories in their prompt. Here are the tags contained in them:\n' +
         referencedCategories.map(c => `- ${c.name}: ${(c.tags || []).map(t => typeof t === 'string' ? t : t.name).join(', ')}`).join('\n');
    }
  }

  const sysPrompt = (aiCustomInstructions || '') + '\n\n' + DEFAULT_SYSTEM + categoryContextStr + '\n\n' + 'Current Workspace State:\n' + JSON.stringify(workspaceContext, null, 2);

  if (!aiApiKey && aiProvider !== 'custom') {
    throw new Error(`Please configure your API key for ${aiProvider} in AI Settings.`);
  }

  try {
    if (aiProvider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: aiApiKey });
      const geminiHistory = history.slice(0, -1).reduce((acc, m) => {
        if (m.geminiParts) {
           acc.push({ role: m.role === 'user' ? 'user' : 'model', parts: m.geminiParts });
        } else {
           const parts = [{ text: m.content || ' ' }];
           if (m.attachments) {
              m.attachments.forEach(att => {
                parts.push({ inlineData: { mimeType: att.type, data: att.data } });
              });
           }
           acc.push({ role: m.role === 'user' ? 'user' : 'model', parts });
        }
        return acc;
      }, []);
      
      const userMsg = history[history.length - 1];
      const userParts = [{ text: userMsg.content || ' ' }];
      if (userMsg.attachments) {
         userMsg.attachments.forEach(att => {
           userParts.push({ inlineData: { mimeType: att.type, data: att.data } });
         });
      }
      
      const payload = {
        model: aiModel || 'gemini-2.5-flash',
        contents: [
            { role: 'user', parts: [{ text: sysPrompt }]},
            { role: 'model', parts: [{ text: 'Understood.' }]},
            ...geminiHistory,
            { role: 'user', parts: userParts }
        ],
      };

      // Sampling params (Gemini supports all three)
      const samplingConfig = {};
      if (typeof aiTemperature === 'number') samplingConfig.temperature = aiTemperature;
      if (typeof aiTopP === 'number' && aiTopP < 1) samplingConfig.topP = aiTopP;
      if (typeof aiTopK === 'number' && aiTopK > 0) samplingConfig.topK = aiTopK;
      if (Object.keys(samplingConfig).length > 0) {
        payload.generationConfig = samplingConfig;
      }

      if (toolHandlers?.search_tags) {
        payload.tools = [{
          functionDeclarations: [
            {
              name: "search_tags",
              description: "Extract visual concepts, characters, and stylistic elements from the user's natural language prompt, and provide them here as a comma-separated list of tags/aliases to look up exact Danbooru tags or Category tags in their local database. Returns matched canonical tags.",
              parameters: {
                type: "OBJECT",
                properties: {
                  prompt: {
                    type: "STRING",
                    description: "The prompt or comma-separated concepts to look up (e.g. 'blonde hair, masterpiece')"
                  }
                },
                required: ["prompt"]
              }
            }
          ]
        }];
      }

      const executeGemini = async (currentPayload) => {
        if (useStream) {
          const responseStream = await ai.models.generateContentStream(currentPayload);
          let fullText = '';
          let allParts = [];
          for await (const chunk of responseStream) {
              if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                 const tc = chunk.functionCalls[0];
                 if (tc.name === 'search_tags') {
                    const args = tc.args;
                    const result = await toolHandlers.search_tags(args.prompt || '');
                    
                    currentPayload.contents.push({
                        role: 'model',
                        parts: [{ functionCall: tc }]
                    });
                    currentPayload.contents.push({
                        role: 'user',
                        parts: [{
                            functionResponse: {
                                name: "search_tags",
                                response: result
                            }
                        }]
                    });
                    return executeGemini(currentPayload);
                 }
              }
              if (chunk.candidates?.[0]?.content?.parts) {
                 chunk.candidates[0].content.parts.forEach(p => {
                    if (p.thought || p.thoughtSignature) {
                      const last = allParts[allParts.length - 1];
                      if (last && last.thought === true && p.thought === true) {
                          last.text = (last.text || '') + (p.text || '');
                      } else {
                          allParts.push({ ...p });
                      }
                    } else if (p.text) {
                      const last = allParts[allParts.length - 1];
                      if (last && !last.thought && !last.thoughtSignature && last.text !== undefined) {
                          last.text += p.text;
                      } else {
                          allParts.push({ text: p.text });
                      }
                    }
                 });
              }
              if (chunk.text) {
                  fullText += chunk.text;
                  onChunk(fullText);
              }
          }
          return { text: fullText, geminiParts: allParts };
        } else {
          const response = await ai.models.generateContent(currentPayload);
          const fcs = response.functionCalls;
          if (fcs && fcs.length > 0) {
              const tc = fcs[0];
              if (tc.name === 'search_tags') {
                 const result = await toolHandlers.search_tags(tc.args.prompt || '');
                 currentPayload.contents.push({
                     role: 'model',
                     parts: [{ functionCall: tc }]
                 });
                 currentPayload.contents.push({
                     role: 'user',
                     parts: [{
                         functionResponse: {
                             name: "search_tags",
                             response: result
                         }
                     }]
                 });
                 return executeGemini(currentPayload);
              }
          }
          return { text: response.text, geminiParts: response.candidates?.[0]?.content?.parts || [] };
        }
      };

      const resultObj = await executeGemini(payload);
      if (typeof resultObj === 'string') return resultObj;
      return resultObj;
      
    } else if (aiProvider === 'openai' || aiProvider === 'custom') {
      const baseURL = aiProvider === 'custom' ? normalizeBaseUrl(aiBaseUrl) : undefined;
      const openai = new OpenAI({
        apiKey: aiApiKey || 'dummy-key',
        baseURL,
        dangerouslyAllowBrowser: true,
      });

      const openaiHistory = history.map(m => {
        if (m.attachments && m.attachments.length > 0) {
          const content = [];
          if (m.content) content.push({ type: "text", text: m.content });
          m.attachments.forEach(att => {
             content.push({ type: "image_url", image_url: { url: `data:${att.type};base64,${att.data}` } });
          });
          return { role: m.role, content };
        }
        return { role: m.role, content: m.content || ' ' };
      });

      const payload = {
        model: aiModel || (aiProvider === 'custom' ? 'local-model' : 'gpt-4o-mini'),
        messages: [
          { role: 'system', content: sysPrompt },
          ...openaiHistory
        ]
      };

      // Sampling params (OpenAI/custom: temperature + top_p only)
      if (typeof aiTemperature === 'number') payload.temperature = aiTemperature;
      if (typeof aiTopP === 'number' && aiTopP < 1) payload.top_p = aiTopP;
      // (top_k not supported by OpenAI-compatible APIs)

      if (toolHandlers?.search_tags) {
        payload.tools = [{
          type: "function",
          function: {
            name: "search_tags",
            description: "Extract visual concepts, characters, and stylistic elements from the user's natural language prompt, and provide them here as a comma-separated list of tags/aliases to look up exact Danbooru tags or Category tags in their local database. Returns matched canonical tags.",
            parameters: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "The prompt or comma-separated concepts to look up (e.g. 'blonde hair, masterpiece')"
                }
              },
              required: ["prompt"]
            }
          }
        }];
      }

      const executeOpenAI = async (currentPayload) => {
        if (useStream) {
          currentPayload.stream = true;
          const stream = await openai.chat.completions.create(currentPayload);
          let fullText = '';
          let fullReasoning = '';
          let toolCallArgs = '';
          let toolCallName = '';
          let toolCallId = '';

          for await (const chunk of stream) {
              const delta = chunk.choices[0]?.delta;
              if (delta?.tool_calls) {
                  const tc = delta.tool_calls[0];
                  if (tc.id) toolCallId = tc.id;
                  if (tc.function?.name) toolCallName = tc.function.name;
                  if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
              }
              if (delta?.reasoning_content) {
                  fullReasoning += delta.reasoning_content;
              }
              if (delta?.content) {
                  fullText += delta.content;
                  onChunk(fullText);
              }
          }

          if (toolCallName === 'search_tags') {
              let args = { prompt: '' };
              try { args = JSON.parse(toolCallArgs); } catch (e) {}
              const result = await toolHandlers.search_tags(args.prompt || '');
              
              const asstMsg = {
                  role: 'assistant',
                  content: fullText || null,
                  tool_calls: [{
                      id: toolCallId,
                      type: 'function',
                      function: { name: toolCallName, arguments: toolCallArgs }
                  }]
              };
              if (fullReasoning) asstMsg.reasoning_content = fullReasoning;
              currentPayload.messages.push(asstMsg);

              currentPayload.messages.push({
                  role: 'tool',
                  tool_call_id: toolCallId,
                  name: toolCallName,
                  content: JSON.stringify(result)
              });
              currentPayload.stream = false; // simplify recurse
              return executeOpenAI(currentPayload);
          }
          return { text: fullText, reasoning_content: fullReasoning };
        } else {
          currentPayload.stream = false;
          const response = await openai.chat.completions.create(currentPayload);
          const msg = response.choices[0].message;
          if (msg.tool_calls && msg.tool_calls.length > 0) {
              const tc = msg.tool_calls[0];
              if (tc.function.name === 'search_tags') {
                  let args = { prompt: '' };
                  try { args = JSON.parse(tc.function.arguments); } catch(e) {}
                  const result = await toolHandlers.search_tags(args.prompt || '');
                  
                  currentPayload.messages.push(msg);
                  currentPayload.messages.push({
                      role: 'tool',
                      tool_call_id: tc.id,
                      name: tc.function.name,
                      content: JSON.stringify(result)
                  });
                  return executeOpenAI(currentPayload);
              }
          }
          return { text: msg.content, reasoning_content: msg.reasoning_content };
        }
      };

      // ── Custom endpoints: tunnel through Tauri's Rust-side proxy. ───────
      // The OpenAI SDK calls fetch() from the browser webview, which gets
      // blocked by CORS on servers that don't send Access-Control-Allow-Origin.
      // The Rust proxy has no such restriction. Users can disable this in
      // AI Settings (e.g. for trusted local servers where they want direct calls).
      if (aiProvider === 'custom') {
        if (useProxy) {
          return await executeOpenAIProxied(payload, useStream, toolHandlers, onChunk, baseURL, aiApiKey);
        }
        return await executeOpenAI(payload);
      }

      return await executeOpenAI(payload);

    } else if (aiProvider === 'anthropic') {
      // Very basic fetch wrapper since we didn't install the Anthropic SDK
      const anthropicHistory = history.map(m => ({
        role: m.role,
        content: m.content || ' '
      }));

      const payload = {
          model: aiModel || 'claude-3-haiku-20240307',
          max_tokens: 1024,
          system: sysPrompt,
          messages: anthropicHistory
      };

      // Sampling params (Anthropic: temperature only)
      if (typeof aiTemperature === 'number') payload.temperature = aiTemperature;
      
      // We haven't implemented SSE parsing for Anthropic yet, so fallback to non-streaming
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': aiApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerously-allow-browser': 'true'
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Anthropic API Error');
      }
      const data = await res.json();
      const text = data.content[0].text;
      if (useStream) {
        onChunk(text);
      }
      return text;
    }
  } catch (error) {
    console.error('AI Error:', error);
    throw error;
  }
}

export async function checkConnectionAndGetModels(settings) {
  const { aiProvider, aiApiKey, aiBaseUrl, aiUseProxy } = settings;
  if (!aiApiKey && aiProvider !== 'custom') {
    throw new Error('API key is missing.');
  }
  // aiUseProxy defaults to true so CORS-restricted endpoints (e.g. Ollama Cloud) work out of the box.
  const useProxy = aiUseProxy !== false;

  // Friendly error hint when a hosted endpoint rejects an unauthenticated request.
  const explainAuthError = (status, url) => {
    const isHosted = /^https?:\/\/(?!localhost|127\.|0\.0\.0\.0)/i.test(url || '');
    if (status === 401 || status === 403) {
      if (!aiApiKey && isHosted) {
        return `Connection failed: ${status} Unauthorized. This endpoint requires an API key — paste one in the API Key field above and try again.`;
      }
      if (aiApiKey && (status === 401 || status === 403)) {
        return `Connection failed: ${status}. The API key was rejected. Double-check it for typos or extra spaces.`;
      }
    }
    return `Connection failed: ${status}`;
  };

  // Wrap proxy errors with a hint about what's most likely wrong.
  const prependProxyHint = (err, url) => {
    const msg = err?.message || String(err);
    const status = err?.status;
    if (status === 401 || status === 403) {
      return explainAuthError(status, url);
    }
    return msg;
  };

  try {
    if (aiProvider === 'gemini') {
      const ai = new GoogleGenAI({ apiKey: aiApiKey });
      const modelsData = await ai.models.list();
      let models = [];
      for await (const m of modelsData) {
        if (m.name.includes('gemini')) {
            models.push(m.name);
        }
      }
      return models.length > 0 ? models : ['gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    } else if (aiProvider === 'openai' || aiProvider === 'custom') {
      const baseURL = aiProvider === 'custom' ? normalizeBaseUrl(aiBaseUrl) : undefined;

      // Custom endpoints go through Tauri's Rust-side HTTP proxy so that
      // CORS-less servers (e.g. Ollama Cloud) still work. Users can disable
      // this in AI Settings to call trusted local servers directly.
      if (aiProvider === 'custom') {
        if (useProxy) {
          try {
            const data = await proxyJson({
              url: `${baseURL}/models`,
              method: 'GET',
              headers: aiApiKey ? { Authorization: `Bearer ${aiApiKey}` } : {},
            });
            const models = data.data || data.models || data || [];
            return (Array.isArray(models) ? models : [])
              .map(m => m.id || m.name || String(m))
              .filter(Boolean)
              .sort();
          } catch (proxyErr) {
            throw new Error(prependProxyHint(proxyErr, baseURL));
          }
        }
        // Direct browser fetch (no proxy) — only viable when the server sends CORS headers.
        const res = await fetch(`${baseURL}/models`, {
          headers: aiApiKey ? { Authorization: `Bearer ${aiApiKey}` } : {},
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new Error(explainAuthError(res.status, baseURL));
          }
          throw new Error(`Connection failed: ${res.status}`);
        }
        const data = await res.json();
        const models = data.data || data.models || data || [];
        return (Array.isArray(models) ? models : [])
          .map(m => m.id || m.name || String(m))
          .filter(Boolean)
          .sort();
      }

      // OpenAI (api.openai.com) — uses the SDK directly, browser CORS isn't an issue.
      const openai = new OpenAI({
        apiKey: aiApiKey || 'dummy-key',
        dangerouslyAllowBrowser: true,
      });

      try {
        const response = await openai.models.list();
        return response.data.map(m => m.id).sort();
      } catch (sdkErr) {
        // Surface SDK errors (401) clearly so users don't think the URL itself is wrong.
        const sdkStatus = sdkErr?.status || sdkErr?.response?.status;
        if (sdkStatus === 401 || sdkStatus === 403) {
          throw new Error(explainAuthError(sdkStatus, 'https://api.openai.com/v1'));
        }
        throw sdkErr;
      }
    } else if (aiProvider === 'anthropic') {
      // Anthropic does not have a models endpoint, return standard list but verify API key works
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': aiApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hello' }]
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Invalid Anthropic API Key');
      }
      return ['claude-3-haiku-20240307', 'claude-3-5-sonnet-20240620', 'claude-3-opus-20240229'];
    }
  } catch (error) {
    throw error;
  }
}
