import UserModel, { type UserDocument } from '../models/user.model.js';



const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);



/**

 * Trim and lowercase an email for storage/transmission.

 * Preserves dots in the local part (unlike express-validator normalizeEmail).

 */

export function normalizeEmailInput(email: string): string {

  return String(email).trim().toLowerCase();

}



/** Alias for writes (DB, Stripe, mail). Same rules as normalizeEmailInput. */

export function normalizeEmailForStorage(email: string): string {

  return normalizeEmailInput(email);

}



export function splitEmail(email: string): { local: string; domain: string } | null {

  const normalized = normalizeEmailInput(email);

  const at = normalized.lastIndexOf('@');

  if (at < 1 || at === normalized.length - 1) return null;

  return { local: normalized.slice(0, at), domain: normalized.slice(at + 1) };

}



export function isGmailDomain(domain: string): boolean {

  return GMAIL_DOMAINS.has(domain);

}



/** Gmail-only: strip dots and +tags from local part for alias comparison. */

export function gmailCanonicalLocalPart(local: string): string {

  const withoutTag = local.split('+')[0] ?? local;

  return withoutTag.replace(/\./g, '');

}



/**

 * Canonical Gmail form for duplicate/login matching only — never use as stored value.

 * Returns null for non-Gmail addresses.

 */

export function gmailCanonicalEmail(email: string): string | null {

  const parts = splitEmail(email);

  if (!parts || !isGmailDomain(parts.domain)) return null;

  const domain = parts.domain === 'googlemail.com' ? 'gmail.com' : parts.domain;

  return `${gmailCanonicalLocalPart(parts.local)}@${domain}`;

}



/**

 * Mongo $expr filter matching Gmail aliases that share the same canonical local part.

 * Use only as a fallback when an exact email lookup misses.

 */

export function buildGmailAliasMatchExpression(canonicalLocal: string): Record<string, unknown> {

  return {

    $expr: {

      $and: [

        {

          $in: [

            { $toLower: { $arrayElemAt: [{ $split: ['$email', '@'] }, 1] } },

            ['gmail.com', 'googlemail.com'],

          ],

        },

        {

          $eq: [

            {

              $replaceAll: {

                input: {

                  $arrayElemAt: [

                    { $split: [{ $arrayElemAt: [{ $split: ['$email', '@'] }, 0] }, '+'] },

                    0,

                  ],

                },

                find: '.',

                replacement: '',

              },

            },

            canonicalLocal,

          ],

        },

      ],

    },

  };

}



export type FindUserByEmailOptions = {

  select?: string;

};



/**

 * Exact email match first, then Gmail alias fallback (dots/+tags).

 * Use for auth, checkout linking, and any user lookup by email.

 */

export async function findUserByEmail(

  email: string,

  options?: FindUserByEmailOptions,

): Promise<UserDocument | null> {

  const normalized = normalizeEmailInput(email);

  if (!normalized) return null;



  let query = UserModel.findOne({ email: normalized });

  if (options?.select) query = query.select(options.select);

  const exact = await query;

  if (exact) return exact;



  const canonical = gmailCanonicalEmail(normalized);

  if (!canonical) return null;



  const canonicalLocal = canonical.split('@')[0];

  if (!canonicalLocal) return null;



  let aliasQuery = UserModel.findOne(buildGmailAliasMatchExpression(canonicalLocal));

  if (options?.select) aliasQuery = aliasQuery.select(options.select);

  return aliasQuery;

}


