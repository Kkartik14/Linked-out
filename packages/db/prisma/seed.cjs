/**
 * Deterministic dev seed. Wipes app data, then creates a small realistic world:
 * 3 users, a spread of Ls (types/categories/visibility/anonymous), reactions, threaded
 * comments, follows and a collection — then recomputes every denormalized counter so the
 * seeded state is exactly what the services would have produced.
 *
 * Run:  pnpm --filter @linkedout/db seed
 */
const { createPrismaClient } = require('../dist');

const prisma = createPrismaClient();

async function wipe() {
  // Order respects FKs (children first). Follows/reactions/comments/collections → Ls → accounts → users.
  await prisma.notification.deleteMany();
  await prisma.reaction.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.collectionL.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.l.deleteMany();
  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await wipe();

  const kartik = await prisma.user.create({
    data: { username: 'kartik', name: 'Kartik Gupta', email: 'kartik@example.com', bio: 'Building in public. Surviving my Ls.', status: 'BUILDING' },
  });
  const nadia = await prisma.user.create({
    data: { username: 'nadia', name: 'Nadia R', email: 'nadia@example.com', bio: 'PM. Recovering perfectionist.', status: 'INTERVIEWING' },
  });
  const rahul = await prisma.user.create({
    data: { username: 'rahul', name: 'Rahul S', email: 'rahul@example.com', bio: 'Founder. Failed once, going again.', status: 'STARTING_UP' },
  });

  const ls = [];
  const mkL = async (data) => { const l = await prisma.l.create({ data }); ls.push(l); return l; };

  const google = await mkL({ authorId: kartik.id, title: 'Rejected after the final round at Google', story: 'Four rounds in, strong signals, then three weeks of silence. Here is the honest story and what I learned about interview signal.', type: 'STORY', category: 'INTERVIEWS', company: 'Google', tags: ['interview', 'faang'], visibility: 'PUBLIC' });
  const layoff = await mkL({ authorId: kartik.id, title: 'Laid off two weeks after relocating', story: 'Signed the lease on Monday, got the call on Friday. The whole thing.', type: 'PLOT_TWIST', category: 'LAYOFFS', company: 'Swiggy', tags: ['layoff'], visibility: 'PUBLIC' });
  await mkL({ authorId: kartik.id, title: 'Ship before perfect', story: 'A lesson that took me five years and one dead startup to internalize.', type: 'LESSON', category: 'CAREER', tags: ['lesson'], visibility: 'PUBLIC' });
  const burnout = await mkL({ authorId: nadia.id, title: 'Burned out and hid it for months', story: 'I smiled in every standup while quietly falling apart. Writing this anonymously because I still work here.', type: 'SCAR', category: 'CAREER', tags: ['burnout'], visibility: 'PUBLIC', isAnonymous: true });
  await mkL({ authorId: rahul.id, title: 'My first startup died at $0 MRR', story: 'Built for a year, launched to crickets. Talked to zero customers first.', type: 'STORY', category: 'STARTUPS', tags: ['startup', 'pmf'], visibility: 'PUBLIC' });
  await mkL({ authorId: rahul.id, title: 'Interviewing again after the shutdown', story: 'Ongoing. Some days good, most days humbling.', type: 'BATTLE', category: 'INTERVIEWS', tags: ['interviewing'], visibility: 'PUBLIC' });

  // Reactions (author never reacts to their own here).
  await prisma.reaction.createMany({ data: [
    { userId: nadia.id, lId: google.id, type: 'BEEN_THERE' },
    { userId: nadia.id, lId: google.id, type: 'HELPFUL' },
    { userId: rahul.id, lId: google.id, type: 'HELPFUL' },
    { userId: rahul.id, lId: google.id, type: 'RESPECT' },
    { userId: nadia.id, lId: layoff.id, type: 'BEEN_THERE' },
    { userId: rahul.id, lId: burnout.id, type: 'BEEN_THERE' },
    { userId: kartik.id, lId: burnout.id, type: 'SAVED' },
  ] });

  // Comments + one reply.
  const c1 = await prisma.comment.create({ data: { authorId: nadia.id, lId: google.id, body: 'I experienced this exact silence too. Brutal.' } });
  await prisma.comment.create({ data: { authorId: kartik.id, lId: google.id, parentId: c1.id, body: 'Solidarity. It gets better.' } });
  await prisma.comment.create({ data: { authorId: rahul.id, lId: google.id, body: 'The three-week ghost is the worst part.' } });

  // Follows.
  await prisma.follow.createMany({ data: [
    { followerId: nadia.id, followingId: kartik.id },
    { followerId: rahul.id, followingId: kartik.id },
    { followerId: kartik.id, followingId: nadia.id },
  ] });

  // Collection.
  const col = await prisma.collection.create({ data: { ownerId: kartik.id, title: 'Google Interview Journey', slug: 'google-interview-journey' } });
  await prisma.collectionL.createMany({ data: [
    { collectionId: col.id, lId: google.id, position: 0 },
    { collectionId: col.id, lId: layoff.id, position: 1 },
  ] });

  await recomputeCounters();
  console.log('Seed complete: 3 users, 6 Ls, reactions, comments, follows, 1 collection.');
  console.log('Users: kartik, nadia, rahul');
}

async function recomputeCounters() {
  const REACTION_TYPES = ['BEEN_THERE', 'HELPFUL', 'RESPECT', 'PAIN', 'SAVED'];
  const FIELD = { BEEN_THERE: 'beenThereCount', HELPFUL: 'helpfulCount', RESPECT: 'respectCount', PAIN: 'painCount', SAVED: 'savedCount' };

  const ls = await prisma.l.findMany({ select: { id: true } });
  for (const { id } of ls) {
    const [reactions, commentCount] = await Promise.all([
      prisma.reaction.groupBy({ by: ['type'], where: { lId: id }, _count: true }),
      prisma.comment.count({ where: { lId: id } }),
    ]);
    const counts = { beenThereCount: 0, helpfulCount: 0, respectCount: 0, painCount: 0, savedCount: 0 };
    let total = 0;
    for (const r of reactions) { counts[FIELD[r.type]] = r._count; total += r._count; }
    void REACTION_TYPES;
    await prisma.l.update({
      where: { id },
      data: { ...counts, reactionCount: total, commentCount, trendingScore: total + commentCount * 2 },
    });
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  for (const { id } of users) {
    const [lsShared, storiesShared, lessonsShared, collectionsCreated, helpful] = await Promise.all([
      prisma.l.count({ where: { authorId: id } }),
      prisma.l.count({ where: { authorId: id, type: 'STORY' } }),
      prisma.l.count({ where: { authorId: id, type: 'LESSON' } }),
      prisma.collection.count({ where: { ownerId: id } }),
      prisma.reaction.count({ where: { type: 'HELPFUL', l: { authorId: id } } }),
    ]);
    await prisma.user.update({
      where: { id },
      data: { lsShared, storiesShared, lessonsShared, collectionsCreated, buildersHelped: helpful },
    });
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
