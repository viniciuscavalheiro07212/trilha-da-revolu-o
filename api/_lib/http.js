export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

export function methodNotAllowed(response, allowedMethods) {
  response.writeHead(405, {
    allow: allowedMethods.join(", "),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify({ error: "Metodo nao permitido." }));
}

export async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string") return JSON.parse(request.body || "{}");

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

export function queryParam(request, name) {
  const host = request.headers.host || "localhost";
  const url = new URL(request.url || "/", `http://${host}`);
  return url.searchParams.get(name);
}

export function handleApiError(response, error) {
  const message = error?.message || "Nao foi possivel processar a solicitacao.";
  const statusCode = Number(error?.statusCode || 500);
  sendJson(response, statusCode, {
    error: message,
    details: error?.details || null,
  });
}
