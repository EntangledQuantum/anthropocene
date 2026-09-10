# A stretch, a rotation, another stretch — research notes

Sources: Trefethen & Bau, *Numerical Linear Algebra*, Lectures 4–5 (the
SVD; more on the SVD); Golub & Van Loan, *Matrix Computations*, ch. 8
(computing the SVD); Eckart & Young, *Psychometrika* 1 (1936) (low-rank
approximation in Frobenius); Mirsky, *Quart. J. Math.* 11 (1960) (every
unitarily invariant norm). Geometric picture: the unit circle maps to an
ellipse whose semi-axes are $\sigma_i u_i$ (Trefethen Lecture 4; the
standard 2×2 shear illustration).

QR and $\kappa$ are links, not re-teaches.
QR: `linear-algebra/03-factorizations/01-qr`.
Conditioning: `computational-physics/01-numerical-reality/02-conditioning-vs-stability`.

## Solvable chain (thesis §5.2)

1. **Hook / confrontation** — Unit square of the shear becomes a
   parallelogram of the columns. Unit *circle*? (`svd-circle-image`)
2. **Naive attempt** — Bigger circle (isotropic), or the parallelogram,
   or an ellipse whose axes *are* the columns.
3. **The world talks back** — `<SvdLab>` ellipse: dashed circle, magenta
   image, bright singular axes, faint columns. They sit nearby and are
   still the wrong arrows.
4. **Name the structure** — $A = U\Sigma V^{\mathsf T}$. $V^{\mathsf T}$
   rotates, $\Sigma$ stretches by $\sigma_1,\sigma_2$, $U$ rotates the
   ellipse into place. For the shear, $\sigma = (\varphi, 1/\varphi)$.
5. **Tighten** — Eigenvalues of the shear are both 1, so
   $|\lambda_{\max}|/|\lambda_{\min}| = 1$, but $\kappa_2 = \varphi^2$.
   (`svd-eig-not-kappa`) Then hunt $\sigma_2$ until $\kappa_2 = 10$.
   (`svd-flatten-kappa`)
6. **Representation shift** — Eckart–Young: closest rank-1 is
   $\sigma_1 u_1 v_1^{\mathsf T}$, leftover $\sigma_2$. Not the first
   column, not zeroed entries. (`svd-eckart-closest`)
7. **Near-transfer** — $8\times 8$ picture, $\sigma = (5, 1.6, 0.4,
   0.1, \ldots)$. Rank-2 leftover is $\sigma_3 = 0.4$.
   (`svd-rank2-residual`) Sketch $\log_{10}\|A-A_k\|_2$ vs $k$: a
   staircase of dropped $\sigma$. (`svd-residual-vs-rank`)
8. **Optional edge** — Polar form $A = U_p P$; $V$ is eigvecs of
   $A^{\mathsf T}A$ but forming the Gram squares $\kappa$ (QR lesson);
   Golub–Kahan; thin vs full; Mirsky / Frobenius leftover.
9. **Close** — Ellipse; $\sigma$ are the axes; $\kappa_2 =
   \sigma_{\max}/\sigma_{\min}$; drop small $\sigma$.

Target: 16 focused minutes.

## Structure the learner must feel

A unit circle becomes an ellipse. The axis lengths are the singular
values. The columns of $A$ are a different pair of arrows. Thinning the
minor axis is $\kappa$ climbing. Truncating the SVD is collapsing the
ellipse onto its major axes, and that collapse is the *best* rank-$k$
picture you can draw.

Tomorrow picture: $A = U\Sigma V^{\mathsf T}$; $\kappa = \sigma_{\max}/
\sigma_{\min}$; drop small $\sigma$ to compress.

## Most tempting wrong belief

"The image of the unit circle is the parallelogram of the columns, or a
bigger circle." Second: "the ellipse axes *are* the columns." Third:
"$\kappa$ is $|\lambda_{\max}|/|\lambda_{\min}|$, so a shear with
$\lambda = 1,1$ does not stretch." Fourth: "best low-rank is $A$ with
small entries zeroed." Fifth: "the leftover after keeping $k$ modes is
$\sigma_1$, or the mean of the tail."

## Simplest useful case

$$
A = \begin{bmatrix}1&1\\0&1\end{bmatrix}.
$$

$A^{\mathsf T}A = [[1,1],[1,2]]$, characteristic polynomial
$\lambda^2 - 3\lambda + 1 = 0$, $\lambda = (3\pm\sqrt{5})/2$,
$\sigma_1 = \varphi = (1+\sqrt{5})/2$, $\sigma_2 = 1/\varphi$,
$\kappa_2 = \varphi^2 \approx 2.618$. Eigenvalues of $A$ itself: both
$1$ (a Jordan block). Unit circle radii: $\varphi$ and $1/\varphi$.
Rank-1 leftover $\|A-A_1\|_2 = \sigma_2$.

The 8×8 picture is $\sum_k \sigma_k u_k v_k^{\mathsf T}$ with DCT modes
and $\sigma = (5, 1.6, 0.4, 0.1, 0.025, 0.006, 0.0015, 0.0004)$.
Rank-2 residual in 2-norm is $0.4$.

## Transfer costume

An image, a covariance, a discretised Green's function: energy lives in
the first few $\sigma$, the tail is discardable. Physics clothing of the
shear: a simple shear of a unit disk of fluid / a 2D strain; principal
stretches are not the coordinate axes. The QR pair (nearly parallel
columns, $\sigma_{\min}\sim\varepsilon$) is this ellipse with a tiny
minor axis.

## Numerics claims that need tests

- 2×2 SVD reconstructs $A$; $U,V$ orthonormal; shear $\sigma = (\varphi,
  1/\varphi)$.
- $\kappa_2(\mathrm{shear}) = \varphi^2$; eigenvalues of the shear are
  $1,1$.
- Image of the unit circle has radii $\sigma_1,\sigma_2$.
- Ellipse axes are not the columns.
- Eckart–Young: $\|A-A_k\|_2 = \sigma_{k+1}$ on the 2×2 and on the
  picture; Frobenius leftover is $\sqrt{\sigma_{k+1}^2+\cdots}$.
- $\sigma_2 = 0$ collapses the image to a line of length $2\sigma_1$.
- $\sigma_2 = \varphi/10$ gives $\kappa_2 = 10$.
- Dense Jacobi SVD reconstructs the 8×8 picture and recovers the
  prescribed spectrum.
- Rank-2 picture residual is $0.4$.

## What this lesson does not own

$\kappa$ as stretch: conditioning lesson. Householder / "do not form
$A^{\mathsf T}A$": QR lesson. Computing the SVD at scale (Golub–Kahan,
R-bidiagonalisation, randomised SVD): not here. PCA as a statistics
costume: the same SVD, a different course.
