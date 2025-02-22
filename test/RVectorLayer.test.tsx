window.URL.createObjectURL = jest.fn();
import * as fs from 'fs';
import React from 'react';
import {fireEvent, render} from '@testing-library/react';

import {GeoJSON} from 'ol/format';
import {Feature} from 'ol';
import {Point} from 'ol/geom';
import {RFeature, RLayerVector, RContext, RMap, RLayerVectorImage} from 'rlayers';
import * as common from './common';

const parser = new GeoJSON({featureProjection: 'EPSG:3857'});
const geojsonFeatures = JSON.parse(fs.readFileSync('examples/data/departements.geo.json', 'utf-8'));
const features = parser.readFeatures(geojsonFeatures);

describe('<RLayerVector>', () => {
    it('should create and remove a vector layer', async () => {
        const refVector = React.createRef() as React.RefObject<RLayerVector>;
        const refMap = React.createRef() as React.RefObject<RMap>;
        const {container, unmount, rerender} = render(
            <RMap ref={refMap} {...common.mapProps}>
                <RLayerVector ref={refVector} renderBuffer={250} />
            </RMap>
        );
        expect(container.innerHTML).toMatchSnapshot();
        expect(refVector.current).toBeInstanceOf(RLayerVector);
        expect(refMap.current?.ol.getLayers().getLength()).toBe(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((refVector.current?.ol as any).renderBuffer_).toBe(250);
        rerender(<RMap ref={refMap} {...common.mapProps}></RMap>);
        expect(refVector.current).toBeNull();
        expect(refMap.current?.ol.getLayers().getLength()).toBe(0);
        expect(refMap.current?.ol);
        unmount();
    });
    it('should throw an error without a Map', () => {
        // eslint-disable-next-line no-console
        const err = console.error;
        // eslint-disable-next-line no-console
        console.error = () => undefined;
        expect(() => render(<RLayerVector />)).toThrow('must be part of');
        // eslint-disable-next-line no-console
        console.error = err;
    });
    it('should load GeoJSON features', async () => {
        const ref = React.createRef() as React.RefObject<RLayerVector>;
        const {container, unmount} = render(
            <RMap {...common.mapProps}>
                <RLayerVector ref={ref} zIndex={10} features={features} />
            </RMap>
        );
        expect(container.innerHTML).toMatchSnapshot();
        expect(ref.current?.source.getFeatures().length).toBe(geojsonFeatures.features.length);
        unmount();
    });
    it('should attach event handlers to features added after creation', async () => {
        const map = React.createRef() as React.RefObject<RMap>;
        const ref = React.createRef() as React.RefObject<RLayerVector>;
        const handler = jest.fn(common.handlerCheckContext(RLayerVector, ['map'], [map]));
        const {container, unmount} = render(
            <RMap ref={map} {...common.mapProps}>
                <RLayerVector ref={ref} zIndex={10} onClick={handler} />
            </RMap>
        );
        if (map.current === null) throw new Error('failed rendering map');
        const f = new Feature(new Point([0, 0]));
        ref.current?.source.addFeature(f);
        f.dispatchEvent(common.createEvent('click', map.current.ol));
        expect(handler).toHaveBeenCalledTimes(1);
        unmount();
    });
    it('should load trigger addFeature', async () => {
        const addFeature = jest.fn();
        const {container, unmount} = render(
            <RMap {...common.mapProps}>
                <RLayerVector zIndex={10} onAddFeature={addFeature}>
                    <RFeature feature={features[0]}>
                        <RContext.Consumer>
                            {(c) => <div>marker {JSON.stringify(c, common.safeStringify)}</div>}
                        </RContext.Consumer>
                    </RFeature>
                </RLayerVector>
            </RMap>
        );
        expect(container.innerHTML).toMatchSnapshot();
        expect(addFeature).toHaveBeenCalledTimes(1);
        unmount();
    });
    it('should load trigger addFeature/w multiple', async () => {
        const addFeature = jest.fn();
        const vector = React.createRef() as React.RefObject<RLayerVector>;
        const {container, unmount, rerender} = render(
            <RMap {...common.mapProps}>
                <RLayerVector ref={vector} zIndex={10} onAddFeature={addFeature}>
                    {features.map((f, i) => (
                        <RFeature key={i} feature={f}>
                            <RContext.Consumer>
                                {(c) => <div>marker {JSON.stringify(c, common.safeStringify)}</div>}
                            </RContext.Consumer>
                        </RFeature>
                    ))}
                </RLayerVector>
            </RMap>
        );
        expect(container.innerHTML).toMatchSnapshot();
        expect(addFeature).toHaveBeenCalledTimes(features.length);
        rerender(
            <RMap {...common.mapProps}>
                <RLayerVector ref={vector} zIndex={9}>
                    {features.map((f, i) => (
                        <RFeature style={common.styles.blueDot} key={i} feature={f}>
                            <RContext.Consumer>
                                {(c) => <div>marker {JSON.stringify(c, common.safeStringify)}</div>}
                            </RContext.Consumer>
                        </RFeature>
                    ))}
                </RLayerVector>
            </RMap>
        );
        expect(addFeature).toHaveBeenCalledTimes(features.length);
        expect(vector.current?.ol.getListeners('addfeature')).toBeUndefined();
        expect(container.innerHTML).toMatchSnapshot();
        unmount();
    });
    it('should handle Vector Feature events w/update', async () => {
        const mapEvents = ['Click', 'PointerMove'];
        const handler = jest.fn();
        const map = React.createRef() as React.RefObject<RMap>;
        const layer = React.createRef() as React.RefObject<RLayerVector>;
        const handlers = mapEvents.reduce((ac, a) => ({...ac, ['on' + a]: handler}), {});
        const render1 = render(
            <RMap ref={map} {...common.mapProps}>
                <RLayerVector ref={layer} {...handlers} features={features} />
            </RMap>
        );
        if (map.current === null) throw new Error('failed rendering map');
        expect(render1.container.innerHTML).toMatchSnapshot();
        for (const evname of mapEvents)
            for (const f of layer.current?.ol.getSource()?.getFeatures() || [])
                f.dispatchEvent(common.createEvent(evname, map.current.ol));
        render1.unmount();
        // unmount -> remount -> should render the same
        const comp = (
            <RMap ref={map} {...common.mapProps}>
                <RLayerVector ref={layer} {...handlers} features={features} />
            </RMap>
        );
        const render2 = render(comp);
        expect(render2.container.innerHTML).toMatchSnapshot();
        for (const evname of mapEvents)
            for (const f of layer.current?.ol.getSource()?.getFeatures() || []) {
                // do not lose handlers
                f.dispatchEvent(common.createEvent(evname, map.current.ol));
                // do not leak handlers
                expect((f.getListeners(evname.toLowerCase()) || []).length).toBe(1);
            }
        // rerender -> should render the same
        render2.rerender(comp);
        for (const evname of mapEvents)
            for (const f of layer.current?.ol.getSource()?.getFeatures() || []) {
                // do not lose handlers
                f.dispatchEvent(common.createEvent(evname, map.current.ol));
                // do not leak handlers
                expect((f.getListeners(evname.toLowerCase()) || []).length).toBe(1);
            }
        expect(render2.container.innerHTML).toMatchSnapshot();
        expect(handler).toHaveBeenCalledTimes(mapEvents.length * features.length * 3);
    });
    it('should support updating the style', async () => {
        const comp = (style) => (
            <RMap {...common.mapProps}>
                <RLayerVector zIndex={10} style={style}>
                    <RFeature feature={features[0]}>
                        <RContext.Consumer>
                            {(c) => <div>marker {JSON.stringify(c, common.safeStringify)}</div>}
                        </RContext.Consumer>
                    </RFeature>
                </RLayerVector>
            </RMap>
        );
        const {container, rerender, unmount} = render(comp(common.styles.blueDot));
        expect(container.innerHTML).toMatchSnapshot();
        rerender(comp(common.styles.yellow));
        expect(container.innerHTML).toMatchSnapshot();
        unmount();
    });
    it('should update the url', async () => {
        const ref = React.createRef() as React.RefObject<RLayerVector>;
        const comp = (url) => (
            <RMap {...common.mapProps}>
                <RLayerVector ref={ref} format={parser} url={url} />
            </RMap>
        );
        const {rerender, container, unmount} = render(comp('http://url1'));
        if (ref.current === null) throw new Error('failed rendering map');
        expect(container.innerHTML).toMatchSnapshot();
        expect(ref.current?.source.getUrl()).toEqual('http://url1');
        const handler = jest.fn(ref.current?.source.setUrl);
        ref.current.source.setUrl = handler;
        rerender(comp('http://url2'));
        expect(container.innerHTML).toMatchSnapshot();
        expect(handler.mock.calls[0]).toEqual(['http://url2']);
        unmount();
    });
});

describe('<RLayerVectorImage>', () => {
    it('should create and remove a vector layer', async () => {
        const refVector = React.createRef() as React.RefObject<RLayerVectorImage>;
        const refMap = React.createRef() as React.RefObject<RMap>;
        const {container, unmount, rerender} = render(
            <RMap ref={refMap} {...common.mapProps}>
                <RLayerVectorImage
                    url={'http://url1'}
                    format={parser}
                    ref={refVector}
                    renderBuffer={250}
                />
            </RMap>
        );
        expect(container.innerHTML).toMatchSnapshot();
        expect(refVector.current).toBeInstanceOf(RLayerVectorImage);
        expect(refMap.current?.ol.getLayers().getLength()).toBe(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((refVector.current?.ol as any).renderBuffer_).toBe(250);
        expect(refVector.current?.source.getUrl()).toBe('http://url1');

        rerender(<RMap ref={refMap} {...common.mapProps}></RMap>);
        expect(refVector.current).toBeNull();
        expect(refMap.current?.ol.getLayers().getLength()).toBe(0);
        expect(refMap.current?.ol);

        rerender(
            <RMap ref={refMap} {...common.mapProps}>
                <RLayerVectorImage
                    url={'http://url2'}
                    format={parser}
                    ref={refVector}
                    renderBuffer={250}
                />
            </RMap>
        );
        expect(container.innerHTML).toMatchSnapshot();
        expect(refVector.current?.source.getUrl()).toBe('http://url2');
        unmount();
    });
});
