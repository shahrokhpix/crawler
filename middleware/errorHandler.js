const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'خطای داخلی سرور';

  res.status(statusCode).json({
    success: false,
    message,
  });
};

module.exports = errorHandler;