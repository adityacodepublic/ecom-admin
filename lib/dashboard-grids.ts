/**
 * The column classes of the dashboard's card grids, shared by each grid and its loading skeleton
 * (components/loading/dashboard-loadings.tsx) so both always have the same columns. A plain module (no
 * "use client"): server and client components can both import it.
 */

/** The three total cards at the top, and the three visitor numbers. */
export const THREE_GRID = "sm:grid-cols-3";
/** Two cards side by side: the order bars, the visitor panels. */
export const PAIR_GRID = "md:grid-cols-2";
/** The order number cards: 5 across on large screens when there are more than 4, else 4. */
export const orderNumbersGrid = (count: number) => (count > 4 ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-4");
/** The insight number cards. */
export const INSIGHT_NUMBERS_GRID = "sm:grid-cols-2 lg:grid-cols-4";
/** The insight cards under them. */
export const INSIGHT_CARDS_GRID = "md:grid-cols-2 lg:grid-cols-3";
