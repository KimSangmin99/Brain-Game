import {
  makeAttempt,
  recoverAttempt,
  reduceAttempt,
  type Attempt,
  type Action,
} from "./pattern";
import {
  makeSequenceAttempt,
  recoverSequence,
  reduceSequence,
  type SequenceAttempt,
  type SequenceAction,
} from "./sequence";
import type { MemoryEngine } from "./memory-types";
export const patternEngine: MemoryEngine<Attempt, Action> = {
  game: "pattern",
  isAttempt: (a): a is Attempt => a.version === "pattern-v1",
  make: makeAttempt,
  recover: recoverAttempt,
  reduce: reduceAttempt,
};
export const sequenceEngine: MemoryEngine<SequenceAttempt, SequenceAction> = {
  game: "sequence",
  isAttempt: (a): a is SequenceAttempt => a.version === "sequence-v1",
  make: makeSequenceAttempt,
  recover: recoverSequence,
  reduce: reduceSequence,
};

import {
  makeRuleAttempt,
  recoverRule,
  reduceRule,
  type RuleAttempt,
  type RuleAction,
} from "./rule";
export const ruleEngine: MemoryEngine<RuleAttempt, RuleAction> = {
  game: "rule",
  isAttempt: (a): a is RuleAttempt => a.version === "rule-v1",
  make: makeRuleAttempt,
  recover: recoverRule,
  reduce: reduceRule,
};

import {
  makeCodeAttempt,
  recoverCode,
  reduceCode,
  type CodeAttempt,
  type CodeAction,
} from "./code";
export const codeEngine: MemoryEngine<CodeAttempt, CodeAction> = {
  game: "code",
  isAttempt: (a): a is CodeAttempt => a.version === "code-v1",
  make: makeCodeAttempt,
  remake: (a) => makeCodeAttempt(a.stage, a.mode, [a.secret]),
  recover: recoverCode,
  reduce: reduceCode,
};

import {
  makeArrangementAttempt,
  recoverArrangement,
  reduceArrangement,
  type ArrangementAttempt,
  type ArrangementAction,
} from "./arrangement";
export const arrangementEngine: MemoryEngine<
  ArrangementAttempt,
  ArrangementAction
> = {
  game: "arrangement",
  isAttempt: (a): a is ArrangementAttempt => a.version === "arrangement-v1",
  make: makeArrangementAttempt,
  remake: (a) => makeArrangementAttempt(a.stage, a.mode, [a.question.id]),
  recover: recoverArrangement,
  reduce: reduceArrangement,
};

import {
  makeRouteAttempt,
  recoverRoute,
  reduceRoute,
  type RouteAttempt,
  type RouteAction,
} from "./route";
export const routeEngine: MemoryEngine<RouteAttempt, RouteAction> = {
  game: "route",
  isAttempt: (a): a is RouteAttempt => a.version === "route-v1",
  make: makeRouteAttempt,
  remake: (a) => makeRouteAttempt(a.stage, a.mode, [a.question.id]),
  recover: recoverRoute,
  reduce: reduceRoute,
};
