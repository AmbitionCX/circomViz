export const susQuestions = [
  'I think that I would like to use this system frequently.',
  'I found the system unnecessarily complex.',
  'I thought the system was easy to use.',
  'I think that I would need the support of a technical person to be able to use this system.',
  'I found the various functions in this system were well integrated.',
  'I thought there was too much inconsistency in this system.',
  'I would imagine that most people would learn to use this system very quickly.',
  'I found the system very cumbersome to use.',
  'I felt very confident using the system.',
  'I needed to learn a lot of things before I could get going with this system.',
] as const

export const contributionQuestions = [
  'The hierarchy view helped me narrow the search scope.',
  'The coordinated views helped me distinguish source-level computation from constraint-level enforcement.',
  'The provenance links helped me justify my diagnosis.',
  'Scope comparison helped me identify anomalous components.',
  'Partial compilation made large circuits easier to inspect.',
  'The property checks helped me connect the stated intent with enforced constraints.',
  'The visual representations increased my confidence in the diagnosis.',
] as const

export const interviewQuestions = [
  'Which task was the most difficult, and why?',
  'How did you decide where to inspect first?',
  'At what point did you move from source-level reasoning to constraint-level reasoning?',
  'Which visual evidence changed or confirmed your hypothesis?',
  'Did provenance tracing help you explain the root cause rather than merely locate it?',
  'Was partial compilation understandable and trustworthy?',
  'Did any visual representation mislead you?',
  'What could the conventional workflow do better?',
  'Which CircomVis feature would be most valuable in your actual workflow?',
  'What would prevent you from using it in production?',
] as const

export const agreementOptions = [
  'Strongly disagree',
  'Disagree',
  'Neither agree nor disagree',
  'Agree',
  'Strongly agree',
] as const
