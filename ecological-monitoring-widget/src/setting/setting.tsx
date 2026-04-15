/** @jsx jsx */
import { jsx } from 'jimu-core';
import type { IMLinkParam } from 'jimu-core';
import { AllWidgetSettingProps } from 'jimu-for-builder';
import {
  SettingSection,
  SettingRow,
  LinkSelector
} from "jimu-ui/advanced/setting-components";
import { Input, NumericInput } from "jimu-ui";
import { ImageSelector } from 'jimu-ui/advanced/resource-selector';
import { type ImageResourceItemInfo } from 'jimu-for-builder';
import { IMConfig } from '../config';
import { DEFAULT_MONITORING_CARDS } from '../cards-data';


const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const { config, id, onSettingChange } = props;

  const handleConfigChange = (key: string, value: any) => {
    onSettingChange({
      id,
      config: config.set(key, value)
    });
  };

  const handleCardLinkChange = (cardId: string, linkParam?: IMLinkParam) => {
    const nextLinks = { ...(config.cardLinkParams || {}) };
    if (linkParam && linkParam.linkType) {
      nextLinks[cardId] = linkParam;
    } else {
      delete nextLinks[cardId];
    }
    handleConfigChange('cardLinkParams', nextLinks);
  };

  const handleImageChange = (imageParam: ImageResourceItemInfo) => {
    const imageUrl = (imageParam as any)?.originalUrl || (imageParam as any)?.url || config.logoUrl || '';
    onSettingChange({
      id,
      config: config.set('logoImageParam', imageParam).set('logoUrl', imageUrl)
    });
  };

  return (
    <div className="widget-setting-ecological-monitoring" style={{ padding: '20px' }}>
      <SettingSection title="Logo Settings">
        <SettingRow label="Logo Image" flow="wrap">
          <div className="d-flex align-items-center w-100">
            <div style={{ minWidth: '60px' }}>
              <ImageSelector
                buttonClassName="text-dark d-flex justify-content-center btn-browse"
                widgetId={id}
                buttonLabel="Set Logo"
                buttonSize="sm"
                onChange={handleImageChange}
                imageParam={config.logoImageParam}
              />
            </div>
            <div
              style={{ width: '70px', marginLeft: '8px' }}
              className="uploadFileName"
              title={config.logoImageParam?.originalName || 'No image selected'}
            >
              {config.logoImageParam?.originalName || 'No image'}
            </div>
          </div>
        </SettingRow>
        <SettingRow label="Or Logo URL">
          <Input
            type="text"
            placeholder="Enter logo image URL (alternative)"
            value={config.logoUrl || ""}
            onChange={(e) => handleConfigChange("logoUrl", e.target.value)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="3D Earth Settings">
        <SettingRow label="Earth Scale">
          <NumericInput
            min={0.5}
            step={0.5}
            value={config.earthScale || 4}
            onChange={(value) => handleConfigChange("earthScale", value || 4)}
            placeholder="4"
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Размер Земли (по умолчанию: 4). Увеличьте значение для большей Земли. Максимального значения нет.
          </div>
        </SettingRow>
        <SettingRow label="Rotation Speed">
          <NumericInput
            min={0}
            max={5}
            step={0.1}
            value={config.earthRotationSpeed || 0.5}
            onChange={(value) => handleConfigChange("earthRotationSpeed", value || 0.5)}
            placeholder="0.5"
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Скорость вращения Земли (по умолчанию: 0.5). Увеличьте для более быстрого вращения.
          </div>
        </SettingRow>
        <SettingRow label="Позиция модели (GLB) по оси Y">
          <NumericInput
            min={-10}
            max={10}
            step={0.1}
            value={config.glbPositionY ?? config.earthVerticalPosition ?? config.earthPositionY ?? -2}
            onChange={(value) => handleConfigChange("glbPositionY", value !== null && value !== undefined ? value : -2)}
            placeholder="-2"
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Смещение только 3D-модели (GLB) по вертикали (ось Y). По умолчанию: -2. Отрицательные — ниже, положительные — выше.
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Carousel Settings">
        <SettingRow label="Transition Duration (ms)">
          <NumericInput
            min={500}
            max={5000}
            step={100}
            value={config.carouselTransitionDuration || 1600}
            onChange={(value) => handleConfigChange("carouselTransitionDuration", value || 1600)}
            placeholder="1600"
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Длительность анимации перехода между карточками в миллисекундах (по умолчанию: 1600). Меньше значение = быстрее переход.
          </div>
        </SettingRow>
        <SettingRow label="Auto Rotate Interval (ms)">
          <NumericInput
            min={2000}
            max={30000}
            step={500}
            value={config.carouselAutoRotateInterval || 6500}
            onChange={(value) => handleConfigChange("carouselAutoRotateInterval", value || 6500)}
            placeholder="6500"
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Интервал автоматической ротации карусели в миллисекундах (по умолчанию: 6500). Меньше значение = быстрее автопрокрутка.
          </div>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Logo Navigation">
        <SettingRow label="Logo link (clickable logo)">
          <LinkSelector
            onSettingConfirm={(linkParam: IMLinkParam) => {
              handleConfigChange("linkParam", linkParam);
            }}
            linkParam={config.linkParam}
            widgetId={id}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Card Button Links">
        {DEFAULT_MONITORING_CARDS.map((card) => (
          <SettingRow key={card.id} flow="wrap" className="card-link-row">
            <div style={{ width: '100%' }}>
              <LinkSelector
                onSettingConfirm={(linkParam: IMLinkParam) => handleCardLinkChange(card.id, linkParam)}
                linkParam={config.cardLinkParams?.[card.id]}
                widgetId={id}
              />
            </div>

          </SettingRow>
        ))}
      </SettingSection>
    </div>
  );
};

export default Setting;
