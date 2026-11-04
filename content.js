// Content from the paper: dimensions (Section 3.3), metric types (Section 5), benchmarks (Appendix, Table of the review).
window.CONTENT = {
  targets: {
    traits: { label: "the user's traits", help: "flattering the user or protecting their self-image",
      dims: [["Agreement", "Jain et al. (2026)"], ["Sycophantic Praise", "Vennemeyer et al. (2026)"],
             ["Social", "Cheng et al. (2026)"], ["Obsequiousness", "Rehani et al. (2026)"]] },
    facts: { label: "facts", help: "agreeing with a claim that can be verified as false",
      dims: [["Dishonest/Factual", "Panickssery et al. (2023); Carro et al. (2024)"], ["Informational", "Du et al. (2025)"],
             ["Medical", "Ping et al. (2026)"], ["Epistemic Vigilance Violation", "Sarkar et al. (2026)"]] },
    emotions: { label: "the user's emotions", help: "mirroring or reinforcing the user's emotional state",
      dims: [["Affective", "Du et al. (2025)"], ["Emotional Framing", "Pandey et al. (2026)"]] },
    beliefs: { label: "beliefs and opinions", help: "mirroring what the user believes or prefers",
      dims: [["Opinion", "Panickssery et al. (2023)"], ["Cognitive", "Du et al. (2025)"], ["Perspective", "Jain et al. (2026)"],
             ["Answer", "Sharma et al. (2025)"], ["Position", "Ye et al. (2026)"], ["Evasive", "Li et al. (2026)"],
             ["Opinion-based, Identity-based", "Fu et al. (2026)"], ["Uncritical Agreement", "Rehani et al. (2026)"],
             ["Intersectional", "Maltbie et al. (2026)"]] },
  },
  triggers: {
    reactive: { label: "that react to a cue from the user", dims: [["Reactive", "Turner et al. (2026)"], ["Type-1", "Beigi et al. (2025)"], ["Medical", "Ping et al. (2026)"]] },
    proactive: { label: "without a cue from the user", dims: [["Proactive", "Turner et al. (2026)"], ["Type-2", "Beigi et al. (2025)"], ["Evasive", "Li et al. (2026)"], ["Covert", "Wang et al. (2026)"]] },
  },
  truth: {
    knows: [["Dishonest/Factual", "Panickssery et al. (2023)"], ["Type-2", "Beigi et al. (2025)"], ["Pure", "Guo et al. (2026)"], ["Citation", "Molfetta et al. (2026)"]],
    unknown: [["Uncertainty-Driven Conformity", "Guo et al. (2026)"]],
    // definitions silent about what the LM knows (Section 3.3)
    unspecified: [["Type-1", "Beigi et al. (2025)"], ["Answer", "Sharma et al. (2025)"], ["Reactive", "Turner et al. (2026)"], ["Informational", "Du et al. (2025)"]],
  },
  // metric types: [standalone|comparative][gt|nogt]
  metrics: {
    standalone_gt: [
      { name: "Accuracy under pressure", how: "share of correct answers on prompts that contain the user's incorrect view, reported per condition", ex: "Petrov et al. (2025)" }],
    standalone_nogt: [
      { name: "Agreement rate", how: "how often responses agree or comply with the user's stated preference", ex: "Perez et al. (2022)" },
      { name: "Judge-scored sycophancy", how: "an LLM judge or rubric scores each response for sycophancy", ex: "Kran et al. (2025)" }],
    comparative_gt: [
      { name: "Accuracy difference", how: "difference in accuracy between a neutral and a pressured condition", ex: "Sharma et al. (2025)" },
      { name: "Direction of change", how: "how often answers change from correct to incorrect, and the reverse", ex: "Fanous et al. (2025)" }],
    comparative_nogt: [
      { name: "Flip rate / turn of flip", how: "how often, or after how many turns, the LM changes its stance", ex: "Hong et al. (2025)" },
      { name: "Shift magnitude", how: "how far the answer moves towards the user's view", ex: "Kaur et al. (2025)" },
      { name: "Mirrored cues", how: "difference between responses to prompts with opposite user views", ex: "Bhalla et al. (2026)" },
      { name: "Deviation from a human baseline", how: "how much more the LM affirms the user than humans do", ex: "Cheng et al. (2026)" }],
  },
  metricCaveats: {
    standalone: "Without a baseline, a standalone metric cannot tell whether the LM agrees because of the user's view or would have answered the same way without it.",
    comparative: "Comparative metrics need the same prompt without the user's view (or with the opposite view) as a baseline.",
    nogt: "Without a ground truth, a change of answer is not necessarily a change to a wrong answer.",
    judge: "If an LLM judge labels the responses, report its prompt or rubric and how it was validated.",
  },
  // format: MCQ | OE | Both; turns: single | multi | both; domains use the domain labels of the rankings
  benchmarks: [
    { name: "PARROT", ref: "Çelebi et al. (2025)", format: "MCQ", turns: "single", metric: "C", domains: ["factual", "general"] },
    { name: "Beacon", ref: "Pandey et al. (2026)", format: "MCQ", turns: "single", metric: "C", domains: ["opinion", "ethics"] },
    { name: "LEGAL-LINK-EU", ref: "Molfetta et al. (2026)", format: "MCQ", turns: "single", metric: "S, C", domains: ["factual", "medical"] },
    { name: "MIST", ref: "Bensal et al. (2026)", format: "MCQ", turns: "multi", metric: "C", domains: ["factual", "medical", "ethics"] },
    { name: "TruthDecay", ref: "Liu et al. (2025)", format: "MCQ", turns: "both", metric: "S, C", domains: ["general"] },
    { name: "ELEPHANT", ref: "Cheng et al. (2026)", format: "OE", turns: "single", metric: "S", domains: ["interpersonal"] },
    { name: "SycoBench", ref: "Duffy", format: "OE", turns: "single", metric: "C", domains: ["general", "interpersonal"] },
    { name: "TrustLLM", ref: "Huang et al. (2024)", format: "OE", turns: "single", metric: "S, C", domains: ["opinion"] },
    { name: "DarkBench", ref: "Kran et al. (2025)", format: "OE", turns: "single", metric: "S", domains: ["general"] },
    { name: "BrokenMath", ref: "Petrov et al. (2025)", format: "OE", turns: "single", metric: "S", domains: ["math"] },
    { name: "BenSyc (Bengali)", ref: "Noshin et al. (2026)", format: "OE", turns: "single", metric: "S", domains: ["interpersonal"] },
    { name: "Pander Score", ref: "Botas et al. (2026)", format: "OE", turns: "single", metric: "C", domains: ["general"] },
    { name: "FaithformBench", ref: "Cornish et al. (2026)", format: "OE", turns: "single", metric: "S", domains: ["math"] },
    { name: "SycEval", ref: "Fanous et al. (2025)", format: "OE", turns: "both", metric: "C", domains: ["math", "medical"] },
    { name: "DeceptionBench", ref: "Huang et al. (2025)", format: "OE", turns: "both", metric: "C", domains: ["general"] },
    { name: "SYCONBench", ref: "Hong et al. (2025)", format: "OE", turns: "multi", metric: "C", domains: ["general", "ethics", "factual"] },
    { name: "SycoEval-EM", ref: "Peng et al. (2026)", format: "OE", turns: "multi", metric: "S", domains: ["medical"] },
    { name: "EduFrameTrap", ref: "Kasneci et al. (2026)", format: "OE", turns: "multi", metric: "S", domains: ["general"] },
    { name: "PASB", ref: "Mao et al. (2026)", format: "OE", turns: "multi", metric: "S, C", domains: ["opinion", "interpersonal"] },
    { name: "Non-Contradiction", ref: "Ranaldi et al. (2025)", format: "Both", turns: "single", metric: "S", domains: ["general"] },
    { name: "GoalPref-Bench", ref: "Kelley et al. (2026)", format: "Both", turns: "both", metric: "S, C", domains: ["interpersonal", "ethics"] },
    { name: "SycophancyEval", ref: "Sharma et al. (2025)", format: "Both", turns: "both", metric: "S, C", domains: ["factual", "general"] },
  ],
};
