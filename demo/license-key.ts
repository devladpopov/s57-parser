/** Public half of the licence signing key; the private half is kept off the repo. */
export const LICENSE_PUBLIC_JWK: JsonWebKey = {"kty":"EC","crv":"P-256","x":"GdNTbSdxXHwwy5K-MVVxiV1xst0lV_-gx_jM0b6Jd58","y":"wEUNLO75u0_kJF6oBG6EnUYfGPsl2JTLuW9tAJlUkOc"};

/** Licence server (server/license-server.ts behind the site's /api/). */
export const LICENSE_SERVER = 'https://plotter.stadika.ru/api';
