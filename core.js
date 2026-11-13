(function (root) {
  const duration = (text) => {
    const parts = text.trim().split(':');
    return parts.length >= 2 && parts.every((p) => /^\d+$/.test(p))
      ? parts.reduce((total, p) => total * 60 + Number(p), 0)
      : null;
  };
  function compare(a, b, sort) {
    switch (sort) {
      case 'title':
        return a.title.localeCompare(b.title) || a.order - b.order;
      case 'channel':
        return a.channel.localeCompare(b.channel) || a.order - b.order;
      case 'shortest':
        return (
          (a.duration ?? Infinity) - (b.duration ?? Infinity) ||
          a.order - b.order
        );
      case 'longest':
        return (b.duration ?? -1) - (a.duration ?? -1) || a.order - b.order;
      case 'reverse':
        return b.order - a.order;
      default:
        return a.order - b.order;
    }
  }
  function matches(video, query, filter, minutes = 15) {
    if (
      !`${video.title} ${video.channel}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
      return false;
    if (filter === 'watched') return video.progress >= 100;
    if (filter === 'unwatched') return video.progress === 0;
    if (filter === 'short')
      return video.duration !== null && video.duration <= 600;
    if (filter === 'long')
      return video.duration !== null && video.duration >= 1800;
    if (filter === 'session')
      return (
        Number.isFinite(minutes) &&
        minutes > 0 &&
        video.duration !== null &&
        video.duration <= minutes * 60
      );
    return true;
  }
  function watchTime(videos) {
    const seconds = videos.reduce(
      (sum, video) => sum + (video.duration ?? 0),
      0,
    );
    const minutes = Math.ceil(seconds / 60);
    const unknown = videos.filter((video) => video.duration === null).length;
    return `${minutes >= 60 ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60}m${unknown ? ` + ${unknown} unknown` : ''}`;
  }
  const api = {
    duration,
    compare,
    matches,
    watchTime,
    older: (firstSeen, days, now = Date.now()) =>
      Number.isFinite(firstSeen) &&
      Number.isFinite(days) &&
      days > 0 &&
      firstSeen < now - days * 86400000,
  };
  root.WLP = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
