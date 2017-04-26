import {Composite, Widget, Button, WidgetCollection} from 'tabris';

let widget: Composite = new Composite();

// Methods
let widgets: Widget[] = [];
let widgetA: Widget = new Button();
let widgetB: Widget = new Button();
let widgetCollection: WidgetCollection = new Composite().find();
let thisReturnValue: Composite;

thisReturnValue = widget.append(widgetA, widgetB);
thisReturnValue = widget.append(widgets);
thisReturnValue = widget.append(widgetCollection);
