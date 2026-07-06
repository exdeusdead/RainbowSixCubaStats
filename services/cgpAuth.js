const CGP_AUTH_URL =
  process.env.CGP_AUTH_URL ||
  "http://localhost:3030/api/auth/me";

async function validateCgpToken(token) {
  if (!token) return null;

  try {
    const response = await fetch(CGP_AUTH_URL, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (!data?.user?.id) return null;

    return data.user;
  } catch {
    return null;
  }
}

async function requireCgpUser(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "");

  const user = await validateCgpToken(token);

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "Invalid CGP session"
    });
  }

  req.cgpUser = user;
  next();
}

module.exports = {
  validateCgpToken,
  requireCgpUser
};
