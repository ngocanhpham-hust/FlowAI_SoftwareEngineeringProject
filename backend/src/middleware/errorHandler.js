function errorHandler(err, req, res, next) {
    if (err) {
        return res.status(400).json({
            error: err.message || "Request failed"
        });
    }

    next();
}

module.exports = errorHandler;
