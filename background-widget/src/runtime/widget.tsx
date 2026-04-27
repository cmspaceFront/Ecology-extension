/** @jsx jsx */
import { React, jsx, type AllWidgetProps } from "jimu-core";
import "./styles/widget.css";

const type1 = require("./assets/type1.jpg");
const type4 = require("./assets/type4.jpg");
const type6 = require("./assets/type6.jpg");

interface IMConfig {}

const THEME_BACKGROUNDS: Record<string, string> = {
  type1,
  type2: "https://super-admin.avidtemplates.com/2.c59b7c56.jpg",
  type3: "https://super-admin.avidtemplates.com/3.e41aa4f9.jpg",
  type4,
  type5: "https://super-admin.avidtemplates.com/5.898434bc.jpg",
  type6,
  type7: "https://super-admin.avidtemplates.com/7.368c39ac.jpg",
  type9: "https://super-admin.avidtemplates.com/7.368c39ac.jpg"
};

const getBackgroundFromLocalStorage = (): string => {
  if (typeof window === "undefined") {
    return type1;
  }
  const themeKey = window.localStorage.getItem("selectedThemeColor") || "type1";
  return THEME_BACKGROUNDS[themeKey] || type1;
};

const TRANSITION_DURATION = 500; // ms

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const [currentBg, setCurrentBg] = React.useState<string>(() => getBackgroundFromLocalStorage());
  const [currentOpacity, setCurrentOpacity] = React.useState(0); // Начинаем с 0 для fade-in при рендере
  const [nextBg, setNextBg] = React.useState<string | null>(null);
  const [nextOpacity, setNextOpacity] = React.useState(0);
  const [isInitialized, setIsInitialized] = React.useState(false);

  // Fade-in при первом рендере
  React.useEffect(() => {
    if (isInitialized) return;

    const img = new Image();
    img.onload = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setCurrentOpacity(1);
          setIsInitialized(true);
        });
      });
    };
    img.src = currentBg;
  }, [currentBg, isInitialized]);

  // Отслеживание смены темы
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    let lastTheme = window.localStorage.getItem("selectedThemeColor") || "type1";
    let isAnimating = false;

    const handleThemeChange = (newThemeKey: string) => {
      const newBgUrl = THEME_BACKGROUNDS[newThemeKey] || THEME_BACKGROUNDS.type1;
      
      if (newBgUrl === currentBg || isAnimating) return;
      isAnimating = true;

      // Предзагрузка нового изображения
      const img = new Image();
      img.onload = () => {
        // Устанавливаем новый фон с opacity 0
        setNextBg(newBgUrl);
        setNextOpacity(0);

        // Запускаем fade-in нового фона
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setNextOpacity(1);
          });
        });

        // После появления нового фона — обновляем основной слой и убираем временный
        setTimeout(() => {
          setCurrentBg(newBgUrl);
          setCurrentOpacity(1);
          setNextBg(null);
          setNextOpacity(0);
          isAnimating = false;
        }, TRANSITION_DURATION + 50);
      };
      img.src = newBgUrl;
    };

    const checkForThemeChange = () => {
      const currentTheme = window.localStorage.getItem("selectedThemeColor") || "type1";
      if (currentTheme !== lastTheme) {
        lastTheme = currentTheme;
        handleThemeChange(currentTheme);
      }
    };

    const intervalId = window.setInterval(checkForThemeChange, 100);

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "selectedThemeColor") {
        const newTheme = event.newValue || "type1";
        lastTheme = newTheme;
        handleThemeChange(newTheme);
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(intervalId);
    };
  }, [currentBg]);

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat"
  };

  return (
    <div
      className="background-widget"
      aria-hidden="true"
      role="presentation"
    >
      {/* Текущий фон — fade-in при первом рендере */}
      <div
        className="bg-layer bg-layer-current"
        style={{
          ...baseStyle,
          backgroundImage: `url(${currentBg})`,
          opacity: currentOpacity,
          zIndex: 1
        }}
      />
      
      {/* Новый фон — плавно появляется поверх старого */}
      {nextBg && (
        <div
          className="bg-layer bg-layer-next"
          style={{
            ...baseStyle,
            backgroundImage: `url(${nextBg})`,
            opacity: nextOpacity,
            zIndex: 2
          }}
        />
      )}
    </div>
  );
};

export default Widget;
