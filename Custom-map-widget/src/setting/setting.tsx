/** @jsx jsx */
import { React, jsx, type AllWidgetSettingProps } from 'jimu-core';
import { type IMConfig } from '../config';

const Setting = (props: AllWidgetSettingProps<IMConfig>) => {
  const { config, id, onSettingChange } = props;

  return (
    <div className="hybrid-map-widget-setting">
      <p>Настройки виджета гибридной карты</p>
      <p className="setting-description">
        Этот виджет отображает карту с гибридным базовым слоем (спутниковые снимки с подписями).
      </p>
    </div>
  );
};

export default Setting;

