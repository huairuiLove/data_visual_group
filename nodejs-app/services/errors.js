class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.expose = true;
  }
}

function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError(500, 'INTERNAL_SERVER_ERROR', '服务器处理请求时发生错误');
}

function sendError(res, error, logLabel = 'Request error') {
  const normalized = normalizeError(error);
  console.error(`${logLabel}:`, error);

  return res.status(normalized.statusCode).json({
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  });
}

module.exports = { AppError, normalizeError, sendError };
