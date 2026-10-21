// Generated from openapi/openapi.json by `pnpm contract`. Do not edit.

export interface paths {
    "/api/auth/sign-in": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["signIn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Exchanges a refresh token for a new pair. The presented token is rotated: it works once. */
        post: operations["refreshSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** @description Ends the session the refresh token belongs to. */
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/items": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["listItems"];
        put?: never;
        post: operations["createItem"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/items/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getItem"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        SignInRequest: {
            /** Format: email */
            email: string;
            password: string;
        };
        RefreshRequest: {
            refreshToken: string;
        };
        Tokens: {
            accessToken: string;
            refreshToken: string;
            /** @description Seconds until the access token expires. */
            expiresIn: number;
        };
        Session: components["schemas"]["Tokens"] & {
            user: components["schemas"]["User"];
        };
        User: {
            id: string;
            /** Format: email */
            email: string;
            name: string;
            /** @enum {string} */
            role: "member" | "admin";
        };
        Item: {
            id: string;
            title: string;
            description?: string;
            /** Format: date-time */
            createdAt: string;
        };
        CreateItemRequest: {
            title: string;
            description?: string;
        };
        ItemPage: {
            items: components["schemas"]["Item"][];
            total: number;
        };
        FieldError: {
            path: string;
            message: string;
        };
        ErrorEnvelope: {
            data: null;
            message: string;
            errors?: components["schemas"]["FieldError"][];
        };
        EmptyEnvelope: {
            data: null;
            message: string;
        };
        SessionEnvelope: {
            data: components["schemas"]["Session"];
            message: string;
        };
        TokensEnvelope: {
            data: components["schemas"]["Tokens"];
            message: string;
        };
        UserEnvelope: {
            data: components["schemas"]["User"];
            message: string;
        };
        ItemEnvelope: {
            data: components["schemas"]["Item"];
            message: string;
        };
        ItemPageEnvelope: {
            data: components["schemas"]["ItemPage"];
            message: string;
        };
    };
    responses: {
        /** @description The request is invalid; `errors` names each field. */
        ValidationError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorEnvelope"];
            };
        };
        /** @description Missing, expired or invalid credentials. */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorEnvelope"];
            };
        };
        /** @description No such record (or not visible to the caller). */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorEnvelope"];
            };
        };
        /** @description Rate limited; retry after the Retry-After header. */
        TooManyRequests: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorEnvelope"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    signIn: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignInRequest"];
            };
        };
        responses: {
            /** @description Signed in: a new session. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionEnvelope"];
                };
            };
            400: components["responses"]["ValidationError"];
            401: components["responses"]["Unauthorized"];
            429: components["responses"]["TooManyRequests"];
        };
    };
    refreshSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshRequest"];
            };
        };
        responses: {
            /** @description A new token pair. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TokensEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RefreshRequest"];
            };
        };
        responses: {
            /** @description Signed out. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EmptyEnvelope"];
                };
            };
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The signed-in user. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UserEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    listItems: {
        parameters: {
            query?: {
                limit?: number;
                offset?: number;
                /** @description Case-insensitive search in titles. */
                q?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of items, newest first. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemPageEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
        };
    };
    createItem: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateItemRequest"];
            };
        };
        responses: {
            /** @description The created item. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemEnvelope"];
                };
            };
            400: components["responses"]["ValidationError"];
            401: components["responses"]["Unauthorized"];
        };
    };
    getItem: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The item. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ItemEnvelope"];
                };
            };
            401: components["responses"]["Unauthorized"];
            404: components["responses"]["NotFound"];
        };
    };
}
