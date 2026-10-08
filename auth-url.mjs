export function isLoginURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && !u.port && ['auth.openai.com','auth0.openai.com','chatgpt.com'].includes(u.hostname);
  } catch { return false; }
}
