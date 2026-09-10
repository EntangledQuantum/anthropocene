# A stable way to lose a column — research notes

Sources: Trefethen & Bau, *Numerical Linear Algebra*, Lectures 7 (QR), 8
(Gram–Schmidt), 10 (Householder triangularization), 11 (least squares),
16 (stability of Householder), 19 (stability of least-squares algorithms);
Higham, *Accuracy and Stability*, ch. 20 (least squares).

## Solvable chain (thesis §5.2)

1. **Hook / confrontation** — Two nearly parallel columns. Form AᵀA. At
   ε = 10⁻⁸, what is the computed 2×2? (`qr-ata-at-eps`)
2. **Naive attempt** — Drag ε. Watch the columns close and AᵀA become
   `[[1,1],[1,1]]` while R₂₂ stays order ε. (`QrLab`, columns)
3. **The world talks back** — Hunt the ε where 1+ε² rounds to 1.
   (`qr-lost-column`) Magenta (Gram excess) dies; cyan (|R₂₂|) does not.
4. **Name the structure** — A Householder reflector is a mirror that sends
   a column onto the axis. One reflection zeros a column below the diagonal
   without forming AᵀA. (`QrLab`, reflector)
5. **Tighten** — Same ε, what happens to R₂₂? The subtraction in F is not
   the Gram cancellation. (`qr-r22-survives`)
6. **Representation shift** — κ₂(AᵀA) = κ₂(A)² as a number.
   (`qr-kappa-ata`) Conditioning is a link, not a re-teach.
7. **Near-transfer** — Least squares, b = A(1,1). QR recovers x; the
   normal equations form the singular Gram. (`qr-ls-method`)
8. **Optional edge** — Sign choice in `house(x)` (advanced tier). Classical
   Gram–Schmidt is a different unstable QR; not owned here.
9. **Close** — Two arrows. AᵀA writes ε² against 1. A reflector writes
   R₂₂ ~ ε. κ(AᵀA) = κ(A)²; QR does not square it.

Target: 16 focused minutes.

## Structure the learner must feel

Two nearly parallel arrows. Their Gram inner products add ε² to 1; float64
swallows that sum and the 2×2 becomes rank-1. A Householder mirror sends
the first column onto the axis and writes the leftover orthogonal piece
into R₂₂, which is order ε, not ε². Orthogonal Q does not stretch, so
κ(R) = κ(A). Forming AᵀA squares it.

Picture to leave: two arrows; the Gram square going singular; a triangular
R whose (2,2) entry still holds the angle.

## Most tempting wrong belief

"Inner products of well-scaled columns come back exact, so AᵀA cannot lose
rank that A still has." Second: "normal equations and QR are the same
least-squares problem, so they return the same x." Third: "Householder
subtracts a projection, so it cancels the same way." Fourth: "κ gets a bit
worse, maybe double, not square." Fifth: "the tiny ε entries of A round
away first."

## Simplest useful case

$$
A = \begin{bmatrix}1&1\\\varepsilon&0\\0&\varepsilon\end{bmatrix},\qquad
\varepsilon = 10^{-8}.
$$

Exact: $A^{\mathsf T}A = [[1+\varepsilon^2, 1],[1, 1+\varepsilon^2]]$,
eigenvalues $2+\varepsilon^2$ and $\varepsilon^2$,
$\kappa_2(A) = \sqrt{(2+\varepsilon^2)/\varepsilon^2} \approx \sqrt{2}/\varepsilon \approx 1.4\times 10^8$,
$\kappa_2(A^{\mathsf T}A) = \kappa_2(A)^2 \approx 2\times 10^{16}$.
$|R_{22}| = \varepsilon\sqrt{2+\varepsilon^2}/\sqrt{1+\varepsilon^2} \approx \varepsilon\sqrt{2}$.

In float64, $1+\varepsilon^2 = 1$, so the computed Gram is $[[1,1],[1,1]]$.

Householder: $v = x + \mathrm{sign}(x_1)\|x\| e_1$,
$F = I - 2vv^{\mathsf T}/v^{\mathsf T}v$.

## Transfer costume

Least squares: $b = A(1,1)^\top = (2,\varepsilon,\varepsilon)$. Exact $x = (1,1)$.
QR recovers it. The normal equations try to invert the computed Gram and
fail (singular) or return garbage. Physics clothing: two nearly collinear
force directions; recovering the two magnitudes from a measured resultant.
The small angle *is* the information, and AᵀA squares it into ε².

## Numerics claims that need tests

- Householder $Q$ is orthogonal ($Q^{\mathsf T}Q = I$) and $A = QR$.
- $F x = -\mathrm{sign}(x_1)\|x\| e_1$, tail zero.
- $\kappa_2(A^{\mathsf T}A) = \kappa_2(A)^2$ in real arithmetic for the pair.
- At ε = 10⁻⁸, computed Gram is exactly $[[1,1],[1,1]]$; $|R_{22}| \sim \varepsilon\sqrt{2}$.
- Lost-column threshold is $\sqrt{\varepsilon_{\mathrm{mach}}/2}$.
- QR recovers $x = (1,1)$ on $b = A(1,1)$; normal equations are singular or
  far worse. On a nearby inconsistent pair the NE residual is worse.
- Remaining digits: QR keeps ~7; NE keeps ~0.

## Conditioning is a link

κ as stretch is owned by
`computational-physics/01-numerical-reality/02-conditioning-vs-stability`.
This lesson uses it: forming AᵀA is an algorithm that *adds* a stretch
κ(A). Do not re-teach the 2×2 disk picture.
