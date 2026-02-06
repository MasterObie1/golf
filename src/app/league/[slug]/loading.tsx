export default function LeagueLoading() {
  return (
    <div className="min-h-screen bg-[#F8FAF9]">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header skeleton */}
        <div className="mb-8 text-center">
          <div className="h-10 w-64 bg-gray-200 rounded-lg mx-auto mb-3 animate-pulse" />
          <div className="h-5 w-48 bg-gray-200 rounded mx-auto animate-pulse" />
        </div>

        {/* Content skeleton */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-6 animate-pulse">
            <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6 animate-pulse">
            <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded" />
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
