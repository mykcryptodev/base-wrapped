export default function Share() {
  return (
    <div className="flex justify-center gap-4 mb-8">
      <button
        onClick={() => {
          const url = window.location.href;
          navigator.share?.({
            title: 'Base Wrapped 2024',
            text: 'Check out my Base Wrapped 2024!',
            url
          }).catch(() => {
            navigator.clipboard.writeText(url);
            alert('Link copied to clipboard!');
          });
        }}
        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 transition-colors rounded-lg text-gray-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
          <polyline points="16 6 12 2 8 6"/>
          <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
        Share
      </button>

      <a
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out my Base Wrapped 2024 by @mykcryptodev!' + window.location.href)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 transition-colors rounded-lg text-gray-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        Post
      </a>

      <a
        href={`https://warpcast.com/~/compose?text=${encodeURIComponent('Check out my Base Wrapped 2024 by @myk ! ' + window.location.href)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-100 transition-colors rounded-lg text-gray-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 1000 1000" fill="none" className="w-4 h-4">
          <path d="M257.778 155.556H742.222V844.444H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.444H257.778V155.556Z" fill="#855DCD"/>
          <path d="M128.889 253.333L157.778 351.111H182.222V746.667C169.949 746.667 160 756.616 160 768.889V795.556H155.556C143.283 795.556 133.333 805.505 133.333 817.778V844.444H382.222V817.778C382.222 805.505 372.273 795.556 360 795.556H355.556V768.889C355.556 756.616 345.606 746.667 333.333 746.667H306.667V253.333H128.889Z" fill="#855DCD"/>
          <path d="M675.556 746.667C663.283 746.667 653.333 756.616 653.333 768.889V795.556H648.889C636.616 795.556 626.667 805.505 626.667 817.778V844.444H875.556V817.778C875.556 805.505 865.606 795.556 853.333 795.556H848.889V768.889C848.889 756.616 838.94 746.667 826.667 746.667V351.111H851.111L880 253.333H702.222V746.667H675.556Z" fill="#855DCD"/>
        </svg>
        Cast
      </a>
  </div>
  )
}