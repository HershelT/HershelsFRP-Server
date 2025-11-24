/**
 * Validation Middleware
 * Input validation using Joi
 */

const Joi = require('joi');

/**
 * Validation schemas
 */
const schemas = {
    // User registration
    register: Joi.object({
        username: Joi.string()
            .lowercase()
            .alphanum()
            .min(3)
            .max(20)
            .pattern(/^[a-z0-9-]+$/)
            .required()
            .messages({
                'string.pattern.base': 'Username can only contain lowercase letters, numbers, and hyphens',
                'string.min': 'Username must be at least 3 characters',
                'string.max': 'Username cannot exceed 20 characters'
            }),
        email: Joi.string()
            .email()
            .lowercase()
            .required()
            .messages({
                'string.email': 'Please provide a valid email address'
            }),
        password: Joi.string()
            .min(8)
            .max(128)
            .required()
            .messages({
                'string.min': 'Password must be at least 8 characters',
                'string.max': 'Password cannot exceed 128 characters'
            }),
        githubUsername: Joi.string()
            .alphanum()
            .max(39)
            .optional()
            .allow(null, '')
    }),

    // User login
    login: Joi.object({
        emailOrUsername: Joi.string()
            .required()
            .messages({
                'any.required': 'Email or username is required'
            }),
        password: Joi.string()
            .required()
            .messages({
                'any.required': 'Password is required'
            })
    }),

    // Update profile
    updateProfile: Joi.object({
        displayName: Joi.string()
            .max(50)
            .optional()
            .allow(null, ''),
        bio: Joi.string()
            .max(500)
            .optional()
            .allow(null, ''),
        githubUsername: Joi.string()
            .alphanum()
            .max(39)
            .optional()
            .allow(null, '')
    }),

    // Change password
    changePassword: Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string()
            .min(8)
            .max(128)
            .required()
            .messages({
                'string.min': 'New password must be at least 8 characters'
            })
    }),

    // Token creation
    createToken: Joi.object({
        name: Joi.string()
            .max(50)
            .optional()
            .allow(null, '')
    }),

    // Token update
    updateToken: Joi.object({
        name: Joi.string()
            .max(50)
            .required()
    }),

    // Tunnel connection (internal)
    tunnelConnect: Joi.object({
        subdomain: Joi.string()
            .lowercase()
            .pattern(/^[a-z0-9]+(-[a-z0-9]+){2,}$/)
            .required()
            .messages({
                'string.pattern.base': 'Subdomain must follow pattern: username-project-role'
            }),
        localPort: Joi.number()
            .integer()
            .min(1)
            .max(65535)
            .required(),
        tunnelType: Joi.string()
            .valid('http', 'tcp', 'udp')
            .default('http'),
        clientIp: Joi.string().ip().optional(),
        clientVersion: Joi.string().max(50).optional()
    })
};

/**
 * Middleware factory: Validate request body against schema
 */
function validate(schemaName) {
    return (req, res, next) => {
        const schema = schemas[schemaName];

        if (!schema) {
            return res.status(500).json({
                success: false,
                error: 'Validation schema not found'
            });
        }

        const { error, value } = schema.validate(req.body, {
            abortEarly: false, // Return all errors, not just first
            stripUnknown: true // Remove unknown fields
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors
            });
        }

        // Replace req.body with validated value
        req.body = value;
        next();
    };
}

/**
 * Middleware: Validate query parameters
 */
function validateQuery(schema) {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            return res.status(400).json({
                success: false,
                error: 'Query validation failed',
                errors
            });
        }

        req.query = value;
        next();
    };
}

module.exports = {
    validate,
    validateQuery,
    schemas
};
