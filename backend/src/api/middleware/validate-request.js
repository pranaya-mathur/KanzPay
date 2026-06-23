import { ZodError } from 'zod';

export function validateRequest(schema) {
    return (req, res, next) => {
        try {
            req.validated = schema.parse({
                ...req.query,
                ...req.body,
                ...req.params,
            });
            next();
        } catch (err) {
            next(err);
        }
    };
}

export function errorHandler(err, req, res, next) {
    if (err instanceof ZodError) {
        return res.status(400).json({
            error: 'Validation failed',
            details: err.errors,
        });
    }

    if (err.status) {
        return res.status(err.status).json({ error: err.message });
    }

    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
}
