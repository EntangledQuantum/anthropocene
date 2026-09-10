# Forward UQ — research notes (Agent 33)

Smith, *Uncertainty Quantification*, SIAM 2014: the prediction of a model with
uncertain inputs is the *pushforward* of the input measure. Oberkampf & Roy
(2010) split numerical, parametric, and model-form uncertainty so they are not
printed as one bar. Saltelli & Annoni, *Environ. Model. Softw.* **25** (2010):
one-at-a-time walks a cross and leaves the hypercube unexplored.

## Solvable chain

1. **Hook.** One verified decay/heat-mode run at λ = 1, T = 3. Predict: is
   this the prediction? (`uq-one-run`)
2. **Naive attempt.** Print 0.050. Or attach ±50% linearly from λ = 1 ± 0.5.
   Or refuse until the mesh is finer (V&V, already closed).
3. **The world talks back.** Uniform[0.5, 1.5] pushed through e^{−λ T}.
   Symmetric in, piled at small q, and E[q] sits above q(μ). (`<UqLab kind="push">`)
4. **Name the structure.** Forward UQ is Monte Carlo of the *parameter*.
   Linear maps scale a cloud; this map is 1/q on the image. (`uq-output-density`)
5. **Tighten.** Hunt T where E[q]/q(μ) = sinh(δ T)/(δ T) hits 1.5.
   (`uq-jensen-t`)
6. **Representation shift.** Input histogram ↔ output smear. Two vertical
   rules: q(μ) and E[q], peeling as T grows.
7. **Near-transfer.** A₀ and λ both uncertain. OAT is a cross; the floor
   lives at a corner. (`uq-oat-corner`, `<UqLab kind="oat">`)
8. **Optional edge.** Sobol / interactions; inverse UQ is a different
   question; model-form does not average out. (`<Tier advanced>`, `uq-error-kinds`)
9. **Close.** A histogram of outputs, not a single curve. (`uq-cloud-card`)

## Structure the learner must feel

A symmetric input cloud becoming a 1/q pile-up, with the mean of the smear
sitting *above* the run at the mean. Then a plus-sign in a square whose
corners leak past both arms.

Tomorrow picture: a histogram of outputs, not a single curve.

## Most tempting wrong belief

**The run at the mean parameter is the prediction.** (It is one sample, and
once the map bends it is not even the centre of the smear.)

Secondary: **a symmetric input cloud stays symmetric, and ± on λ becomes ±
on q.** (True of a linear map. The exponential fattens the small-q end and
moves the mean.)

Tertiary: **varying one parameter at a time maps the output range.** (OAT
walks a cross. The smallest remaining is min A₀ and max λ together.)

Misconceptions: `point-is-prediction`, `linear-propagation`, `oat-is-enough`.

## Simplest useful case

q = e^{−λ T} with λ ~ Uniform[0.5, 1.5]. Closed-form mean
e^{−μ T} sinh(δ T)/(δ T), closed-form density 1/((b−a) T y) on the image.
Two-parameter product q = A₀ e^{−λ T} with the same uniforms: joint floor
is half the OAT floor at T = 3.

## Transfer costume

First heat mode on a unit rod: u(1/2, T) = exp(−π² α T). Absorb π² into
the clock and λ is the decay rate the previous lesson just verified the
stencil for. Radioactive decay and Newton's cooling wear the same exponential.

## Numerics claims (each tested)

- Linear map Y = aX + b: sample mean → aμ + b, variance → a²σ²; tail ratio
  stays ~1.
- exp(X) for X ~ N(0,1): mean e^{1/2}, skewness ≫ 0, tail ratio ≫ 1
  (lognormal fattens the right tail).
- Uniform λ through e^{−λ T}: sample mean matches the closed form and
  exceeds the point estimate; output skewness > input; density is 1/y and
  integrates to 1.
- sinh(δ T)/(δ T) = 1 at T = 0, grows with T; T for ratio 1.5 inverts.
- Joint range of the two-parameter product strictly contains the OAT
  envelope; sampled OAT hits the exact envelope, sampled joint breaches it.

## Sources

- R. C. Smith, *Uncertainty Quantification: Theory, Implementation, and
  Applications*, SIAM (2014). https://doi.org/10.1137/1.9781611973228
- W. L. Oberkampf, C. J. Roy, *Verification and Validation in Scientific
  Computing*, Cambridge (2010). https://doi.org/10.1017/CBO9780511760396
- A. Saltelli, P. Annoni, “How to avoid a perfunctory sensitivity analysis,”
  *Environ. Model. Softw.* **25** 1508–1517 (2010).
  https://doi.org/10.1016/j.envsoft.2010.04.012
- A. Saltelli et al., “Why so many published sensitivity analyses are false,”
  *Environ. Model. Softw.* **114** 29–39 (2019).
  https://doi.org/10.1016/j.envsoft.2018.11.008
- I. M. Sobol', “Global sensitivity indices for nonlinear mathematical
  models,” *Math. Comput. Simulation* **55** 271–280 (2001).

## Tomorrow picture

A histogram of outputs. Magenta tick at q(mean parameter), cyan tick at
mean of q, and they are not the same tick.
