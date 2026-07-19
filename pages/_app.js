export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #1a1a2e;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
  }
