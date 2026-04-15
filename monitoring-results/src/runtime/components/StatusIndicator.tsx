/** @jsx jsx */
import { React, jsx } from "jimu-core";
import "../styles/StatusIndicator.css";

interface StatusIndicatorProps {
  uzcosmosStatus: 'pending' | 'completed' | 'in-progress';
  uzcosmosProgress: number; // Always 100
  ekologiyaStatus: 'pending' | 'warning' | 'caution' | 'completed'; // For color determination
  ekologiya: boolean | null; // true = 100%, false = 0%, null = null (for progress logic and color)
  prokraturaStatus: 'pending' | 'completed';
  prokraturaProgress: number;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  uzcosmosStatus,
  uzcosmosProgress,
  ekologiyaStatus,
  ekologiya,
  prokraturaStatus,
  prokraturaProgress
}) => {
  const getUzcosmosColor = () => {
    return '#28BEC1'; // cyan/turquoise
  };

  const getEkologiyaColor = () => {
    // Color based on actual value: true = #28BEC1, false = #C12862, null = same as prokratura
    if (ekologiya === true) {
      return '#28BEC1'; // cyan/turquoise
    } else if (ekologiya === false) {
      return '#C12862'; // pink/red
    } else {
      return '#7aa8e0'; // same as prokratura (null/jarayonda)
    }
  };

  const getProkraturaColor = () => {
    switch (prokraturaStatus) {
      case 'completed':
        return '#7aa8e0'; // gray-blue
      default:
        return '#7aa8e0'; // gray-blue
    }
  };

  const getEkologiyaAnimationClass = () => {
    // Animation class based on value: true = cyan, false = red, null = blue-gray
    if (ekologiya === true) {
      return 'animate-cyan';
    } else if (ekologiya === false) {
      return 'animate-red';
    } else {
      return 'animate-blue-gray';
    }
  };

  // Fixed positions: UZCOSMOS at 0%, EKOLOGIYA at 50%, PROKRATURA at 100%
  const uzcosmosPosition = 0;
  const ekologiyaPosition = 50;
  const prokraturaPosition = 100;

  // Logic:
  // - If prokuratura is completed: line goes to 100% (so the prokuratura circle/button is shown)
  // - If ekologiya is null: go halfway to ekologiya (25%)
  // - If ekologiya is false: stop at ekologiya (50%)
  // - If ekologiya is true: go halfway to prokuratura (75%)
  const totalProgress =
    prokraturaProgress >= 100 || prokraturaStatus === 'completed'
      ? prokraturaPosition // 100% - line reaches prokuratura
      : ekologiya === null
        ? uzcosmosPosition + (ekologiyaPosition - uzcosmosPosition) * 0.5 // Halfway to ekologiya (25%)
        : ekologiyaPosition + (prokraturaPosition - ekologiyaPosition) * (ekologiya === true ? 0.5 : 0);

  // Calculate line widths based on progress
  // First segment: 0% to 50% (UZCOSMOS to EKOLOGIYA)
  const firstSegmentWidth = Math.min(totalProgress, ekologiyaPosition);
  // Second segment: 50% to 100% (EKOLOGIYA to PROKURATURA)
  const secondSegmentWidth = Math.max(0, totalProgress - ekologiyaPosition);

  // Pulse only when the line has reached that point
  const lineReachedEkologiya = firstSegmentWidth >= ekologiyaPosition;
  const lineReachedProkratura = secondSegmentWidth >= 50; // second segment is 50% of total

  // Show prokuratura button when the line has reached it, OR when ecology (stage before it) is completed/positive
  const showProkuraturaButton = lineReachedProkratura || ekologiya === true;

  return (
    <div className="status-indicator-container">
      <div className="status-indicator-grid">
        {/* lines layer */}
        <div className="status-indicator-lines">
          <div className="status-indicator-line-background first-segment-bg" />
          <div className="status-indicator-line-background second-segment-bg" />

          <div
            className="status-indicator-line animated first-segment"
            style={{
              transform: `scaleX(${Math.min(1, Math.max(0, firstSegmentWidth / 50))})`
            }}
          />

          {secondSegmentWidth > 0 && (
            <div
              className="status-indicator-line animated second-segment"
              style={{
                transform: `scaleX(${Math.min(1, Math.max(0, secondSegmentWidth / 50))})`
              }}
            />
          )}
        </div>

        {/* slot 1: UZCOSMOS - line always starts here, so pulse always on */}
        <div className="status-slot">
          <div
            className="status-indicator-circle uzcosmos pulse-on"
            style={{
              left: "50%",
              backgroundColor: getUzcosmosColor()
            }}
          />
        </div>

        {/* slot 2: EKOLOGIYA - always pulse (animate) like other circles */}
        <div className="status-slot">
          {ekologiya === null ? (
            <div
              className={`status-indicator-circle ekologiya ${getEkologiyaAnimationClass()} pulse-on`}
              style={{
                left: "50%",
                backgroundColor: getEkologiyaColor(),
                border: "2px solid #2d3e5f"
              }}
            >
              <div className="status-indicator-inner-circle" />
            </div>
          ) : (
            <div
              className={`status-indicator-circle ekologiya ${getEkologiyaAnimationClass()} pulse-on`}
              style={{
                left: "50%",
                backgroundColor: getEkologiyaColor()
              }}
            />
          )}
        </div>

        {/* slot 3: PROKRATURA - visible when line has reached it OR when ecology (before it) is completed/positive */}
        <div className="status-slot">
          {showProkuraturaButton && (
            <div
              className={`status-indicator-circle prokratura pulse-on`}
              style={{
                left: "50%",
                backgroundColor: getProkraturaColor(),
                border: "2px solid #2d3e5f"
              }}
            >
              <div className="status-indicator-inner-circle" />
            </div>
          )}
        </div>
      </div>
    </div>
  );

};

export default StatusIndicator;