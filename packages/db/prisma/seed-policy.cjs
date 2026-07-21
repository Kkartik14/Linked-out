'use strict';

const REACTION_POPULARITY_WEIGHT = Object.freeze({
  BEEN_THERE: 2,
  HELPFUL: 3,
  RESPECT: 2,
  PAIN: 1,
  SAVED: 0,
});

const COMMENT_POPULARITY_WEIGHT = 2;

function popularityScoreFor(reactions, commentCount) {
  let score = commentCount * COMMENT_POPULARITY_WEIGHT;
  for (const reaction of reactions) {
    const weight = REACTION_POPULARITY_WEIGHT[reaction.type];
    if (weight === undefined) throw new Error(`Unknown reaction type: ${reaction.type}`);
    score += reaction._count * weight;
  }
  return score;
}

module.exports = {
  COMMENT_POPULARITY_WEIGHT,
  REACTION_POPULARITY_WEIGHT,
  popularityScoreFor,
};
