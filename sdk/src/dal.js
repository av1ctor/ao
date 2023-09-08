import { fromPromise, of } from "hyper-async";
import {
  __,
  assoc,
  compose,
  evolve,
  map,
  path,
  pipe,
  prop,
  reduce,
  transduce,
} from "ramda";
import { z } from "zod";

const GET_CONTRACTS_QUERY = `
query GetContracts ($contractIds: [ID!]!) {
  transactions(ids: $contractIds) {
    edges {
      node {
        tags {
          name
          value
        }
        block {
          id
          height
          timestamp
        }
      }
    }
  }
}`;

const transactionConnectionSchema = z.object({
  data: z.object({
    transactions: z.object({
      edges: z.array(z.object({
        node: z.record(z.any()),
      })),
    }),
  }),
});

const interactionsPageSchema = z.object({
  paging: z.record(z.any()),
  interactions: z.array(z.object({
    interaction: z.object({
      tags: z.array(z.object({
        name: z.string(),
        value: z.string(),
      })),
      block: z.object({
        id: z.string(),
        height: z.coerce.string(),
        timestamp: z.coerce.string(),
      }),
      sortKey: z.string(),
    }),
  })),
});

const interactionSchema = z.object({
  function: z.string(),
});

/**
 * @typedef Env1
 * @property {fetch} fetch
 * @property {string} GATEWAY_URL
 *
 * @callback LoadTransactionMeta
 * @param {string} id - the id of the contract whose src is being loaded
 * @returns {Async<z.infer<typeof transactionConnectionSchema>['data']['transactions']['edges'][number]['node']>}
 *
 * @param {Env1} env
 * @returns {LoadTransactionMeta}
 */
export function loadTransactionMetaWith({ fetch, GATEWAY_URL }) {
  // TODO: create a dataloader and use that to batch load contracts

  return (id) =>
    of(id)
      .chain(fromPromise((id) =>
        fetch(`${GATEWAY_URL}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: GET_CONTRACTS_QUERY,
            variables: { contractIds: [id] },
          }),
        })
          .then((res) => res.json())
          .then(transactionConnectionSchema.parse)
          .then(path(["data", "transactions", "edges", "0", "node"]))
      ));
}

/**
 * @typedef Env2
 * @property {fetch} fetch
 * @property {string} GATEWAY_URL
 *
 * @callback LoadTransactionData
 * @param {string} id - the id of the contract whose src is being loaded
 * @returns {Async<Response>}
 *
 * @param {Env2} env
 * @returns {LoadTransactionData}
 */
export function loadTransactionDataWith({ fetch, GATEWAY_URL }) {
  // TODO: create a dataloader and use that to batch load contracts

  return (id) =>
    of(id)
      .chain(fromPromise((id) => fetch(`${GATEWAY_URL}/${id}`)));
}

/**
 * @typedef Env3
 * @property {fetch} fetch
 * @property {string} SEQUENCER_URL
 *
 * @typedef LoadInteractionsArgs
 * @property {string} id - the contract id
 * @property {string} from - the lower-most block height
 * @property {string} to - the upper-most block height
 *
 * @callback LoadInteractions
 * @param {LoadInteractionsArgs} args
 * @returns {Async<Record<string, any>}
 *
 * @param {Env3} env
 * @returns {LoadInteractions}
 */
export function loadInteractionsWith({ fetch, SEQUENCER_URL }) {
  // TODO: create a dataloader and use that to batch load interactions

  /**
   * Pad the block height portion of the sortKey to 12 characters
   *
   * This should work to increment and properly pad any sort key:
   * - 000001257294,1694181441598,fb1ebd7d621d1398acc03e108b7a593c6960c6e522772c974cd21c2ba7ac11d5 (full Sequencer sort key)
   * - 000001257294,fb1ebd7d621d1398acc03e108b7a593c6960c6e522772c974cd21c2ba7ac11d5 (Smartweave protocol sort key)
   * - 1257294,1694181441598,fb1ebd7d621d1398acc03e108b7a593c6960c6e522772c974cd21c2ba7ac11d5 (missing padding)
   * - 1257294 (just block height)
   *
   * @param {string} sortKey - the sortKey to be padded. If the sortKey is of sufficient length, then no padding
   * is added.
   */
  const padBlockHeight = (sortKey) => {
    if (!sortKey) return sortKey;
    const [height, ...rest] = String(sortKey).split(",");
    return [height.padStart(12, "0"), ...rest].join(",");
  };

  const mapBounds = evolve({
    from: padBlockHeight,
    to: pipe(
      /**
       * Potentially increment the block height by 1, so
       * the sequencer will include any interactions in that block
       */
      (sortKey) => {
        if (!sortKey) return sortKey;
        const parts = String(sortKey).split(",");
        /**
         * Full sort key, so no need to increment
         */
        if (parts.length > 1) return parts.join(",");

        /**
         * only the block height is being used as the sort key
         */
        const [height] = parts;
        if (!height) return height;
        const num = parseInt(height);
        return String(num + 1);
      },
      /**
       * Still ensure the proper padding is added
       */
      padBlockHeight,
    ),
  });

  /**
   * See https://academy.warp.cc/docs/gateway/http/get/interactions
   */
  return (ctx) =>
    of({ id: ctx.id, from: ctx.from, to: ctx.to })
      .map(mapBounds)
      .chain(fromPromise(({ id, from, to }) =>
        /**
         * A couple quirks to highlight here:
         *
         * - The sequencer returns interactions sorted by block height, DESCENDING order
         *   so in order to fold interactions, chronologically, we need to reverse the order of interactions
         *   prior to returning (see unshift instead of push in trasducer below)
         *
         * - The block height included in both to and from need to be left padded with 0's to reach 12 characters (See https://academy.warp.cc/docs/sdk/advanced/bundled-interaction#how-it-works)
         *   (see padBlockHeight above or impl)
         *
         * - 'from' is inclusive
         *
         * - 'to' is non-inclusive IF only the block height is used at the sort key, so if we want to include interactions in the block at 'to', then we need to increment the block height by 1
         *    (see mapBounds above where we increment to block height by one)
         */
        fetch(
          // TODO: need to be able to load multiple pages until all interactions are fetched
          `${SEQUENCER_URL}/gateway/v2/interactions-sort-key?contractId=${id}&from=${from}&to=${to}`,
        )
          .then((res) => res.json())
          .then(interactionsPageSchema.parse)
          .then(prop("interactions"))
          .then((interactions) =>
            transduce(
              // { interaction: { tags: [ { name, value }] } }
              compose(
                // [ { name, value } ]
                map(path(["interaction", "tags"])),
                // { first: tag, second: tag }
                map(reduce((a, t) => assoc(t.name, t.value, a), {})),
                // "{\"hello\": \"world\"}"
                map(prop("Input")),
                // { hello: "world" }
                map((input) => JSON.parse(input)),
              ),
              (acc, input) => {
                acc.unshift(input);
                return acc;
              },
              [],
              interactions,
            )
          )
          .then(z.array(interactionSchema).parse)
      ));
}
