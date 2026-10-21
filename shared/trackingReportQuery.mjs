export function getWorkspaceDateRange(period, timezone = 'UTC') {
  const now = new Date();
  const formatYMD = (d) => {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch {
      return d.toISOString().slice(0, 10);
    }
  };

  const todayKey = formatYMD(now);
  const [y, m, d] = todayKey.split('-').map(Number);
  const baseNoonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  if (period === 'today') {
    return { fromDate: todayKey, toDate: todayKey };
  }
  if (period === 'yesterday') {
    const prev = new Date(baseNoonUtc);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const prevKey = prev.toISOString().slice(0, 10);
    return { fromDate: prevKey, toDate: prevKey };
  }
  if (period === 'last7days' || period === '7days') {
    // Today and the previous 6 calendar days = 7 days total
    const start = new Date(baseNoonUtc);
    start.setUTCDate(start.getUTCDate() - 6);
    return { fromDate: start.toISOString().slice(0, 10), toDate: todayKey };
  }
  if (period === 'month' || period === 'thisMonth') {
    const startKey = `${y}-${String(m).padStart(2, '0')}-01`;
    return { fromDate: startKey, toDate: todayKey };
  }
  return { fromDate: todayKey, toDate: todayKey };
}

export function trackingReportOptions(scope,filterKey,team,fromDate,toDate,userId,getReports){
  return {
    queryKey:['tracking-private',scope,'reports',filterKey,team,fromDate,toDate,userId],
    initialPageParam:null,
    queryFn:({pageParam,signal})=>getReports({...JSON.parse(filterKey),team,fromDate,toDate,userId:userId||undefined,cursor:pageParam||undefined,summaryOnly:true},signal),
    getNextPageParam:last=>last.nextCursor||undefined,
    staleTime:15000,gcTime:5*60*1000,retry:false
  };
}
