// Single source of truth for individual/team ranking and winner selection.
// Teacher UI (live leaderboard, final results), student UI (final results),
// and results export all consume this exact computation via socket
// payloads or resultsExport.js — never a re-derived parallel calculation —
// so "what's shown live" and "what's exported" can never drift apart.

function participantOf(room, player) {
  return room.participants.get(player.participantId);
}

// count omitted (or not a number) returns every ranked player.
function computeIndividualRankings(room, count) {
  const ranked = [...room.players.values()]
    .map((p) => {
      const participant = participantOf(room, p);
      const team = (room.teams || []).find((t) => t.id === participant.teamId) || null;
      return {
        participantId: p.participantId,
        name: participant.name,
        group: participant.teamId,
        groupName: team ? team.name : "",
        score: p.score,
        streak: p.streak,
        longestStreak: p.longestStreak,
        correctCount: p.correctCount,
        answeredCount: p.answeredCount
      };
    })
    .sort((a, b) => b.score - a.score);
  return typeof count === "number" ? ranked.slice(0, count) : ranked;
}

// Team ranking uses average score across members who have actually
// answered at least one question, not a raw sum — otherwise bigger teams
// win by headcount alone. Teams (and who's on them) are entirely
// teacher-defined via the setup wizard (room.teams) — empty in individual
// mode, which naturally yields an empty ranking list.
function computeTeamRankings(room) {
  return (room.teams || [])
    .map((t) => {
      const members = [...room.players.values()].filter((p) => participantOf(room, p).teamId === t.id);
      const participated = members.filter((p) => p.answeredCount > 0);
      const avgPerformance =
        participated.length > 0
          ? Math.round(participated.reduce((sum, p) => sum + p.score, 0) / participated.length)
          : 0;
      return {
        id: t.id,
        name: t.name,
        color: t.color,
        avgPerformance,
        membersJoined: members.length,
        membersParticipated: participated.length,
        // No fixed roster size to report anymore — just echoes the current
        // joined count so any client still reading this field stays sane.
        groupSize: members.length
      };
    })
    .sort((a, b) => b.avgPerformance - a.avgPerformance);
}

// Winner selection is deliberately not a separate function: the champion
// is always rankings[0] of the exact same computeIndividualRankings/
// computeTeamRankings output gameEngine.finishEvent already computes for
// the full leaderboard payload — a dedicated wrapper would just re-run the
// same sort a second time for no benefit. "Single source of truth for
// winner selection" is satisfied by there being exactly one ranking
// function, not by a redundant accessor on top of it.

module.exports = {
  participantOf,
  computeIndividualRankings,
  computeTeamRankings
};
