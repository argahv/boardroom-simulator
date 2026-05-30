'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <h2 className="text-2xl font-bold mb-4">Something went wrong</h2>
      <p className="text-gray-600 mb-6 max-w-md text-center">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button onClick={reset} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
        Try again
      </button>
    </div>
  );
}
