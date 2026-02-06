export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-10 h-10 border-4 border-[var(--green-primary)]/30 border-t-[var(--green-primary)] rounded-full animate-spin mb-4" />
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    </div>
  );
}
