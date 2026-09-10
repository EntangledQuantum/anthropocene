# Monte Carlo integration — Agent 7 notes

Caflisch, *Monte Carlo and quasi-Monte Carlo methods*, Acta Numerica 1998:
the rate $O(N^{-1/2})$ is independent of dimension, which makes MC the only
viable method for a wide range of high-dimensional problems, and also makes
it slow (4× work for 2× accuracy). Product rules of order $p$ have error
$O(N^{-p/d})$. Quasi-MC is $O((\log N)^d / N)$, useful when effective
dimension is small (Caflisch, Morokoff, Owen 1997).

## Structure the learner must feel

A log-log slope of −1/2 that does not rotate when $d$ changes, against a
product-grid slope of $-p/d$ that flattens until the grid cannot even place
two points per axis in the budget.

## Tempting wrong belief

A second-order grid is always more accurate than random samples, because it
is the higher-order method. (Order is $2/d$ for a product midpoint.)

## Simplest useful case

$f(x) = e^x$ on $[0,1]$, two-cell midpoint vs two uniform samples. Grid wins
by a mile. Same $f$ as a product, $d = 10$, two points per axis ($N = 1024$):
grid relative error $\approx 9.9\%$, MC RMSE $\approx 3.4\%$.

## Transfer costume

A million evaluations is four points per axis in 10D, or two points per axis
in 20D. Path integrals / expected discounted payoffs wear the same exponent.

## Numerics claims (tested)

- Empirical RMSE slope $\approx -1/2$ at $d = 1$ and $d = 6$.
- Product midpoint order $2/d$ against $N$.
- Grid evaluations $n^d$; MC evaluations $= N$ in any $d$.
- Crossover at budget 4096: MC first wins at $d = 6$.
- Importance sampling ($\alpha = 1/2$) cuts variance; $\alpha = 1$ is
  zero-variance; RMSE still $N^{-1/2}$.

## Solvable chain

1. Hook: 10D, two points per axis, 1024 evals. Grid or MC?
2. Naive attempt: pick the second-order grid.
3. World talks back: 10% vs 3.4%. Then sketch $\sigma/\sqrt{N}$ before seeing it.
4. Name: product error $N^{-2/d}$; MC error $\sigma N^{-1/2}$.
5. Tighten: slide $d$, hunt the crossover (budget 4096).
6. Representation shift: $4^{10}$ as a number.
7. Near-transfer: importance sampling drops the line, does not rotate it.
8. Optional edge: quasi-MC, $(\log N)^d / N$, low effective dimension.
9. Close: slope −1/2 that does not care about $d$; a grid that runs out of $n$.
