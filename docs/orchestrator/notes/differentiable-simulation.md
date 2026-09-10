# Gradients through physics — research notes

Primary sources, not recaps:

- Pontryagin maximum principle: a second (adjoint / co-state) solve gives every
  derivative of a scalar cost with respect to the controls. Discrete-time form:
  \(p_t = \nabla_x H(t, x_t, u_t, p_{t+1})\), a backward recursion. Same object as
  reverse-mode AD through a stepper.
- Giles / Giles & Pierce (adjoints in CFD): one extra reverse solve, cost
  independent of the number of inputs, when the quantity of interest is scalar.
- Chen, Rubanova, Bettencourt, Duvenaud, *Neural Ordinary Differential
  Equations*, NeurIPS 2018 (arXiv:1806.07366). Memory argument: reconstruct
  \(z(t)\) by solving the ODE *backwards* instead of storing the forward
  trajectory, so the adjoint costs \(O(1)\) memory in the number of steps.
  Gholami, Keutzer, Biros (ANODE, 2019) document the catch: reverse-time
  reconstruction of a general nonlinear ODE is unstable; checkpointing is the
  honest version of the same idea.
- Raissi, Perdikaris, Karniadakis, *Physics-informed neural networks*, J. Comput.
  Phys. 378 (2019) 686–707. The loss *is* the PDE residual
  \(\|u_t + \mathcal{N}[u]\|^2\) at collocation points, plus data / IC / BC.
  A network that matches data and ignores the residual is interpolation.
- Thesis E9 / §2.7: do not lift the residual. A surrogate that is not checked
  against a residual is cognitive offloading theater.

## Structure the learner must feel

The solver is a map \(\theta \mapsto y(t;\theta)\). A scalar mismatch
\(L(\theta)\) between that trajectory and a target has a gradient. Reverse mode
(the discrete adjoint) produces \(\nabla L\) with one extra reverse sweep,
however many parameters \(\theta\) has. Walking \(-\nabla L\) recovers the
\(\theta\) that produced the target. Two views of one state: the trajectories
overlay, and \(L\) as a bowl in parameter space.

## Most tempting wrong belief

"To get \(n\) derivatives you need \(n\) extra solves." True of forward-mode
and of finite differences. False of reverse mode, which is why adjoints exist.
Second: "a network that matches the data has solved the equation." The residual
is the thing that would have to be small, and it is not implied by interpolation.

Misconceptions to name: `ad-n-params-n-solves`, `ad-curve-above-means-lambda-large`,
`pinn-fit-solves-pde`, `ad-must-unroll`.

## Simplest useful case

Recover \(\lambda\) in \(y' = -\lambda y\), \(y(0)=1\), from a discrete
trajectory. One parameter, one adjoint scalar, a 1-D loss bowl. Discrete reverse
through Euler is ten lines; RK4 is the same chain rule with four stages.

## Transfer costume

Recover \(\omega\) in \(\ddot q = -\omega^2 q\) with the same reverse sweep.
Same bowl, different physics clothing. PINN frontier: the *same* exponential,
now as a collocation residual \( \hat y' + \hat y \) that you can plot.

## Numerics claims (each needs a test)

1. Discrete adjoint \(\mathrm{d}L/\mathrm{d}\lambda\) agrees with a
   complex-step / central-difference gradient of the same loss, relative error
   \(\ll 10^{-6}\) (Euler and RK4).
2. Gradient descent from a wrong \(\lambda\) recovers the true value to a tight
   tolerance (same stepper that draws the widget).
3. One reverse sweep yields *both* \(\partial L/\partial\lambda\) and
   \(\partial L/\partial y_0\); each matches its finite-difference check.
4. A polynomial interpolant of \(\mathrm{e}^{-t}\) can look close in value and
   still have a large residual of \(y' + y\). A residual-trained tiny network
   drives that residual down. Pretty \(\neq\) solved.

## Solvable chain

1. Hook — the simulated decay sits above the data. Which way do you move \(\lambda\)?
2. Naive attempt — finite-difference the whole solver. Fine for one parameter.
3. The world talks back — drag the target; watch GD walk \(\lambda\) until the
   curves lie on top of each other. Trajectory and \(L(\lambda)\) are one state.
4. Name the structure — reverse mode is one extra reverse sweep for a scalar \(L\).
5. Tighten — classify forward vs reverse; sketch the loss bowl.
6. Representation shift — the adjoint code is the chain rule on the stepper you
   already know. Complex-step is the independent check (owned by the Richardson
   lesson).
7. Near-transfer — same machinery recovers \(\omega\) of an oscillator.
8. Optional edge — PINNs. The loss is a residual you can see. A pretty interpolant
   with a large residual is the failure mode.
9. Close — a picture: two curves locking together as a marker slides down a bowl;
   a residual plot that refuses to go away just because the values matched.
