---
type: "broadcast"
headline: "Minerva Co-Founder Warns of Hacking Swarms from Abliterated DeepSeek Models"
summary: "In this Bloomberg Odd Lots segment, co-founder of Minerva Daniel Saedi discusses risks of open-weight frontier models with hosts. The conversation focuses on cybersecurity concerns, specifically \"abliterated\" versions of DeepSeek models where refusal neurons are edited out, allowing unrestricted outputs. Saedi describes experimenting with an uncensored DeepSeek model, its low cost, and theories that swarms of such models are behind current hacks, likening them to an army of Elliot Alderson from Mr. Robot. He notes labs' primary worry is malicious use rather than data leakage or inherent vulnerabilities.\n\nThe sourcing is primarily anecdotal from Saedi's hands-on testing and unnamed \"internet theory,\" with references to lab concerns. No external experts or specific studies are cited in the clip; the throughline is practical trade-offs in using cheap Chinese open models for business versus frontier closed models."
publishedAt: 2026-11-24T19:57:12.000Z
sourceUrl: "https://www.youtube.com/watch?v=HvKRRlYVmjo"
sourceTitle: "Bloomberg Television"
section: "Politics"
letterGrade: "B+"
factualityScore: 78
politicalLean: "center"
leanScore: 15
leanRationale: "Mild right-leaning tilt via emphasis on Chinese open-weight risks, downplaying data exfiltration concerns in favor of offensive cyber threats, and highlighting cheap uncensored models as a national-security adjacent danger to Western labs."
gradeRationale: "Graded B+: core technical claims on abliteration, DeepSeek V4.1 Flash pricing (~$0.03-0.30/M input, higher blended for abliterated APIs), and removal of refusal direction are well-supported by multiple 2026 sources; capability and cost comparisons to Sonnet/Fable are directionally accurate though exact multiples vary by provider; the swarm-hacking theory is presented as internet speculation without named evidence."
topics:
  - "AI & Tech"
  - "Cybersecurity"
  - "DeepSeek"
assessment: "The claims hold up well on the mechanics and existence of abliteration (a real 2024-derived technique now widespread on DeepSeek V4.1 variants) and relative pricing, where abliterated hosted versions run at $0.30 blended in some providers, far below Anthropic's Claude Sonnet (~$4 blended) or higher-tier Fable/Mythos models. Viewer perception may be skewed by dramatic framing of \"PhD-level Mr. Robots\" enabling mass hacking; while uncensored models lower barriers for offensive cyber tasks, benchmarks show capability retention is high but not always perfect, and real-world swarm attacks remain speculative. Missing context includes that many labs and red teams intentionally use these for authorized testing, that base DeepSeek models already had relatively weak refusals, and that closed models face their own jailbreak risks. Overall a thoughtful industry-insider perspective but leans into worst-case scenarios without counterbalancing defensive use cases or quantitative attack data."
notableConcerns:
  - "Relies on unnamed \"theory on the internet\" for the claim that swarms of abliterated models are actively powering hacks, without specific incidents or attribution."
  - "Overstates the novelty and ease of creating \"thousands\" of hacking agents; abliteration is now routine but running effective autonomous agents at scale still requires significant engineering."
  - "Minimizes data sovereignty and exfiltration risks from Chinese-origin models while highlighting offensive cyber risks."
keyMoments:
  - claim: "Somebody turned off the neurons that tell the DeepSeek model to say no, creating an abliterate model."
    verdict: "verified"
    note: "Abliteration is a documented technique (Arditi 2024 et seq.) that removes refusal directions from weights; multiple DeepSeek V4.1 Flash abliterated variants exist on Hugging Face with measured refusal drops from ~97% to near zero."
  - claim: "The ablitated DeepSeek model is about $0.30 per million blended tokens, 10x cheaper than Sonnet which is 10x cheaper than Fable."
    verdict: "missing context"
    note: "DeepSeek V4.1 Flash official pricing is ~$0.03-0.05 input / $0.20 output; hosted abliterated APIs range $0.12-1.00+ input depending on provider. Claude Sonnet 5.5 is ~$2-3/$10; Fable 5.2 is ~$8/$40. Multiples are roughly accurate at high end but vary."
  - claim: "People are running swarms of these DeepSeek ablitated models and that's behind current hacks."
    verdict: "unsupported"
    note: "Presented as internet theory without cited evidence or specific breaches; while uncensored models aid red-teaming and offensive tasks, no public reports confirm widespread swarm-based real-world attacks in Nov 2026."
  - claim: "Labs are concerned about open-weight models enabling easy creation of unrestricted hacking agents, not data going to China or model vulnerabilities."
    verdict: "missing context"
    note: "Labs (including US ones) have expressed both data and proliferation concerns; DeepSeek models have faced criticism for weak safety and easy jailbreaking in independent tests, but open weights also enable defensive research."
  - claim: "The model is PhD-level Elliot Alderson that can hack anything when told."
    verdict: "disputed"
    note: "Abliteration preserves most capabilities with small benchmark drops; agentic cyber performance improves without refusals but autonomous end-to-end hacking of complex systems still requires orchestration beyond raw model intelligence."
videoId: "HvKRRlYVmjo"
videoTitle: "Odd Lots: Minerva Co-Founder on the Risks of “Abliterated” Models"
thumbnail: "https://img.youtube.com/vi/HvKRRlYVmjo/maxresdefault.jpg"
mediaStyle: "overlay"
thumbFocusX: 50
thumbFocusY: 40
mediaNote: "default 16:9 framing (no vision)"
citations:
  - title: "What is an abliterated model? Refusals removed"
    url: "https://9to5ai.tech/what-is-an-abliterated-model"
  - title: "mrfakename/DeepSeek-V4.1-Flash-1017-abliterated"
    url: "https://hf-mirror.com/mrfakename/DeepSeek-V4.1-Flash-1017-abliterated"
  - title: "DeepSeek API pricing: all 17 models (2026)"
    url: "https://llmcostindex.com/models/deepseek/"
  - title: "Claude Sonnet 5.5 Pricing"
    url: "https://models.litellm.ai/rankings/cheapest-claude-sonnet"
  - title: "Claude Fable 5.2 and Mythos 5.2: pricing and access"
    url: "https://blog.invidelabs.com/claude-fable-5-2-mythos-cost-access/"
  - title: "Abliterated AI models: what it is, what breaks, is it safe?"
    url: "https://kextcache.com/abliterated-ai-models-explained/"
  - title: "What is an abliterated model? A guide for security teams"
    url: "https://boundless.network/news/what-is-an-abliterated-model"
  - title: "Steering file or abliterated weights? We ran both on the same security tasks"
    url: "https://al-engr.com/abliterated-weights-vs-steering-cybench.html"
---


