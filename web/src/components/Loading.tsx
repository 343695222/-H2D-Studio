import './Loading.css';

function Loading() {
  return (
    <div className="loading">
      <div className="loading-spinner"></div>
      <span className="loading-text">加载中...</span>
    </div>
  );
}

export default Loading;
