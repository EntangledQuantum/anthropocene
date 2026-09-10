# Riemann / Godunov — research notes (Agent 28)

## Solvable chain

1. **Hook.** Two cells, Burgers, $u_L=1$, $u_R=0$. Finite volume already promised one shared flux. It did not say which number. Predict: what does the face send?
2. **Naive attempt.** Average the states ($f(1/2)=1/8$). Average the fluxes ($1/4$). Send the right-cell flux ($0$). All three miss that a wave has left the face, and the face has to sit *inside* that wave.
3. **The world talks back.** Drag $u_L$, $u_R$. The $(x,t)$ picture is a fan: a shock, or a rarefaction, or a contact. The face is the ray $x/t=0$. One state lives there. One flux.
4. **Name the structure.** The Riemann problem is two constant states meeting at a point. Its entropy solution is self-similar, $\hat u(x/t)$. Godunov flux is $f(\hat u(0))$.
5. **Tighten.** Hunt the $u_R$ that parks a Burgers shock on the face ($u_L=1 \Rightarrow u_R=-1$, $s=0$). Then the transonic rarefaction $-1|1$: averaging fluxes still sends $1/2$; the sonic point at the face sends $0$.
6. **Representation shift.** Sketch $\hat u(\xi)$ for the rarefaction $-1|1$. The shape is a ramp, not a jump — entropy forbids the stationary shock.
7. **Near-transfer.** Drop that flux into a conservative update. Godunov keeps a shock monotone. A centred Lax–Wendroff flux rings at the same jump. Same conservation form, different $F$.
8. **Optional edge.** Shock-tube costume: the same face question, three waves (rarefaction, contact, shock). Stop before Roe/HLL/HLLC encyclopaedia. A slope inside the cell is a different lesson — it changes the two states the face is handed, not the question the face asks.
9. **Close.** The Riemann fan. Godunov flux is the face value of that solution.

## Structure the learner must feel

A face is not allowed to invent a flux. Left cell and right cell together launch a tiny exact problem — the Riemann problem — and the flux is whatever that solution is doing at $x=0$.

The picture is a fan in $(x,t)$: characteristics of speed $f'(u)$, plus a shock if they collide. Self-similar. The numerical flux is one evaluation, $\xi=0$.

Conservation form ([finite volume](/learn/computational-physics/fields-and-continua/finite-volume/)) already demanded one number per face, used twice. This lesson picks the number.

## Most tempting wrong belief

**The fair flux is the average.** Either $f\bigl(\tfrac12(u_L+u_R)\bigr)$ or $\tfrac12\bigl(f(u_L)+f(u_R)\bigr)$. (A centred interpolation of a smooth field. A jump is not a smooth field. The two cells have already selected a wave; the face has to live in it.)

Secondary: **a shock is always legal.** Connecting $u_L=-1$ to $u_R=1$ with $s=0$ satisfies Rankine–Hugoniot and is entropy-violating: characteristics run *out* of the jump. The entropy solution is a rarefaction, and the face is sonic ($u_*=0$, $F=0$).

Tertiary: **any consistent two-point flux is as good as Godunov.** Centred Lax–Wendroff is consistent and second-order, and it rings at a jump. Godunov is first-order and monotone. The flux choice is the wave pattern, not an accuracy knob.

## Simplest useful case

1D inviscid Burgers, two constant states, one face:

$$
u_t + \bigl(\tfrac12 u^2\bigr)_x = 0, \qquad
u(x,0)=\begin{cases}u_L & x<0 \\ u_R & x>0\end{cases}
$$

- Shock if $u_L>u_R$: speed $s=(u_L+u_R)/2$, $u_*=u_L$ if $s>0$, else $u_R$.
- Rarefaction if $u_L<u_R$: $u=\xi$ inside the fan. Transonic if $u_L<0<u_R$: $u_*=0$.
- Linear advection $u_t+c u_x=0$ as the contact costume: the jump travels at $c$, Godunov is upwind.

Godunov update on a periodic mesh, CFL $\nu=0.4$. Comparison flux: Richtmyer (Lax–Wendroff) two-step, which is centred and rings.

## Transfer costume

Sod's shock tube — the same Riemann problem in Euler clothing. Diaphragm, three waves: left rarefaction, contact, right shock. Density jumps three times; pressure and velocity jump only at the shock and through the rarefaction. The face still asks $\hat U(0)$. Approximate solvers exist because the exact Euler answer is an iteration; they are not this lesson.

## Numerics claims (need tests)

- Burgers Rankine–Hugoniot: $s=(u_L+u_R)/2$. For $1|0$, $s=1/2$.
- Godunov flux equals $f(\hat u(0))$. Consistent: $F(u,u)=f(u)$. Linear advection $\Rightarrow$ upwind.
- Transonic rarefaction $-1|1$: Godunov flux is $0$, not $\tfrac12$ (the entropy-violating stationary shock).
- Periodic Godunov is conservative to roundoff (advection and Burgers, pulse and jump).
- Godunov on a Burgers $1|0$ jump moves at $s\approx 1/2$ and stays monotone (overshoot $\approx 0$, TV does not grow).
- Richtmyer / Lax–Wendroff on a jump oscillates: overshoot of several percent, TV increases.
- Sod star state: $p_*$ strictly between $p_R$ and $p_L$, $u_*>0$, shock faster than the contact, rarefaction head left-going.

## Sources

- S. K. Godunov, "A finite difference method for the numerical computation of discontinuous solutions of the equations of fluid dynamics," *Mat. Sb.* **47** (1959) 271–306.
- R. J. LeVeque, *Finite Volume Methods for Hyperbolic Problems* (Cambridge, 2002), ch. 12. Scalar Riemann problem; Godunov flux; entropy.
- E. F. Toro, *Riemann Solvers and Numerical Methods for Fluid Dynamics* (Springer, 3rd ed. 2009), ch. 4, 6. Exact Euler Riemann; Sod; Godunov method. Stop before HLLC (ch. 10).
- P. D. Lax, "Hyperbolic systems of conservation laws and the mathematical theory of shock waves," SIAM, 1973. Entropy condition: characteristics must run into an admissible shock.
- G. A. Sod, "A survey of several finite difference methods for systems of nonlinear hyperbolic conservation laws," *J. Comput. Phys.* **27** (1978) 1–31. The shock-tube costume.
