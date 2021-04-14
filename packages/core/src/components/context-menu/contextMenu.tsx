/*
 * Copyright 2021 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import classNames from "classnames";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { mergeRefs, Props, Utils } from "../../common";
import * as Classes from "../../common/classes";
import { OverlayLifecycleProps } from "../overlay/overlay";
import { PopoverProps, Popover } from "../popover/popover";
import { PopoverTargetProps } from "../popover/popoverSharedProps";

type Offset = {
    left: number;
    top: number;
};

/**
 * Render props relevant to the _content_ of a context menu (rendered as the underlying Popover's content).
 */
export interface ContextMenuContentProps {
    /** Whether the context menu is currently open */
    isOpen: boolean;

    /** The computed target offset (x, y) coordinates for the context menu click event */
    targetOffset: Offset;

    /** The context menu click event. If isOpen is false, this will be undefined. */
    mouseEvent: React.MouseEvent<HTMLElement> | undefined;
}

/**
 * Render props for advanced usage of ContextMenu.
 */
export interface ContextMenuChildrenProps {
    /** Context menu container element class */
    className: string;

    /** Render props relevant to the content of this context menu */
    contentProps: ContextMenuContentProps;

    /** Context menu handler which implements the custom context menu interaction */
    onContextMenu: React.MouseEventHandler<HTMLElement>;

    /** Popover element rendered by ContextMenu, used to establish a click target to position the menu */
    popover: JSX.Element | undefined;

    /** DOM ref for the context menu target, used to calculate menu position on the page */
    ref: React.Ref<any>;
}

export interface ContextMenuProps
    extends OverlayLifecycleProps,
        Pick<PopoverProps, "popoverClassName" | "transitionDuration">,
        Props {
    /**
     * Menu content. This will usually be a Blueprint `<Menu>` component.
     * This optionally functions as a render prop so you can use component state to render content.
     */
    content: JSX.Element | ((props: ContextMenuContentProps) => JSX.Element);

    /**
     * The context menu target. This may optionally be a render function so you can use
     * component state to render the target.
     *
     * If you choose to supply `children` as a function, it will be called with a `ContextMenuChildrenProps` object.
     * You must return a single React element and render out these props correctly in order for ContextMenu to work:
     *
     *   - `onContextMenu` and `ref must be attached to the container element (if it is not a native DOM element,
     *     make sure they get forwarded to the real DOM somehow).
     *   - `popover` must be rendered in place inside the container element, usually as its first child.
     */
    children: React.ReactNode | ((props: ContextMenuChildrenProps) => React.ReactElement);

    /**
     * Whether the context menu is disabled.
     *
     * @default false
     */
    disabled?: boolean;

    /**
     * An optional context menu event handler. This can be useful if you want to do something with the
     * mouse event unrelated to rendering the context menu itself, especially if that involves setting
     * React state (which is an error to do in the render code path of this component).
     */
    onContextMenu?: React.MouseEventHandler<HTMLElement>;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
    className,
    children,
    content,
    disabled = false,
    transitionDuration = 100,
    onContextMenu,
    popoverClassName,
    ...restProps
}) => {
    const [targetOffset, setTargetOffset] = useState<Offset>({ left: 0, top: 0 });
    const [mouseEvent, setMouseEvent] = useState<React.MouseEvent<HTMLElement>>();
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // If disabled prop is changed, we don't want our old context menu to stick around.
    // If it has just been enabled (disabled = false), then the menu ought to be opened by
    // a new mouse event. Users should not be updating this prop in the onContextMenu callback
    // for this component (that will lead to unpredictable behavior).
    useEffect(() => {
        setIsOpen(false);
    }, [disabled]);

    const cancelContextMenu = useCallback((e: React.SyntheticEvent<HTMLDivElement>) => e.preventDefault(), []);

    const handlePopoverInteraction = useCallback((nextOpenState: boolean) => {
        if (!nextOpenState) {
            setIsOpen(false);
            setMouseEvent(undefined);
        }
    }, []);

    const targetRef = useRef<HTMLDivElement>(null);
    const renderTarget = useCallback(
        ({ ref }: PopoverTargetProps) => (
            <div className={Classes.CONTEXT_MENU_POPOVER_TARGET} style={targetOffset} ref={mergeRefs(ref, targetRef)} />
        ),
        [targetOffset],
    );
    const isDarkTheme = useMemo(() => Utils.isDarkTheme(targetRef.current), [targetRef.current]);

    const contentProps: ContextMenuContentProps = { isOpen, mouseEvent, targetOffset };

    // only render the popover if there is content in the context menu;
    // this avoid doing unnecessary rendering & computation
    const menu = disabled ? undefined : Utils.isFunction(content) ? content(contentProps) : content;
    const maybePopover =
        menu === undefined ? undefined : (
            <Popover
                {...restProps}
                content={
                    // this prevents right-clicking inside our context menu
                    <div onContextMenu={cancelContextMenu}>{menu}</div>
                }
                enforceFocus={false}
                // Generate key based on offset so a new Popover instance is created
                // when offset changes, to force recomputing position.
                key={`${targetOffset.left}x${targetOffset.top}`}
                hasBackdrop={true}
                isOpen={isOpen}
                minimal={true}
                onInteraction={handlePopoverInteraction}
                popoverClassName={classNames(popoverClassName, { [Classes.DARK]: isDarkTheme })}
                placement="right-start"
                positioningStrategy="fixed"
                rootBoundary="viewport"
                renderTarget={renderTarget}
                transitionDuration={transitionDuration}
            />
        );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent<HTMLElement>) => {
            // support nested menus (inner menu target would have called preventDefault())
            if (e.defaultPrevented) {
                return;
            }

            if (!disabled) {
                e.preventDefault();
                e.persist();
                setMouseEvent(e);
                const { left, top } = getContainingBlockOffset(containerRef.current);
                setTargetOffset({ left: e.clientX - left, top: e.clientY - top });
                setIsOpen(true);
            }

            onContextMenu?.(e);
        },
        [containerRef.current, onContextMenu, disabled],
    );

    const containerClassName = classNames(className, Classes.CONTEXT_MENU);

    if (Utils.isFunction(children)) {
        return children({
            className: containerClassName,
            contentProps,
            onContextMenu: handleContextMenu,
            popover: maybePopover,
            ref: containerRef,
        });
    } else {
        return (
            <div className={containerClassName} ref={containerRef} onContextMenu={handleContextMenu}>
                {maybePopover}
                {children}
            </div>
        );
    }
};
ContextMenu.displayName = "Blueprint.ContextMenu";

function getContainingBlockOffset(targetElement: HTMLElement | null | undefined): { left: number; top: number } {
    if (targetElement != null) {
        const containingBlock = targetElement.closest(`.${Classes.FIXED_POSITIONING_CONTAINING_BLOCK}`);
        if (containingBlock != null) {
            return containingBlock.getBoundingClientRect();
        }
    }
    return { left: 0, top: 0 };
}
