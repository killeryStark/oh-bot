import { setIcon } from 'obsidian';

export interface SearchableModelSelectOptions {
  models: string[];
  selectedModel?: string;
  placeholder?: string;
  onChange: (selectedModel: string) => void | Promise<void>;
}

export class SearchableModelSelect {
  private containerEl: HTMLElement;
  private options: SearchableModelSelectOptions;
  private models: string[] = [];
  private selectedModel: string = '';
  private placeholder: string = 'Select model...';
  private isOpen: boolean = false;
  private searchQuery: string = '';
  private filteredModels: string[] = [];
  private highlightedIndex: number = -1;

  // DOM Elements
  private triggerEl!: HTMLElement;
  private modelIconEl!: HTMLElement;
  private labelEl!: HTMLElement;
  private iconSpanEl!: HTMLElement;
  private popoverEl!: HTMLElement;
  private searchContainerEl!: HTMLElement;
  private searchInputEl!: HTMLInputElement;
  private clearBtnEl!: HTMLElement;
  private optionsListEl!: HTMLElement;

  // Bound event handlers for cleanup
  private boundOnDocPointerDown: (e: PointerEvent) => void;
  private boundOnWindowResize: () => void;
  private boundOnTriggerClick: (e: MouseEvent) => void;
  private boundOnTriggerKeyDown: (e: KeyboardEvent) => void;
  private boundOnSearchKeyDown: (e: KeyboardEvent) => void;
  private boundOnSearchInput: (e: Event) => void;
  private boundOnClearClick: (e: MouseEvent) => void;

  constructor(containerEl: HTMLElement, options: SearchableModelSelectOptions) {
    this.containerEl = containerEl;
    this.options = options;
    this.models = options.models ? [...options.models] : [];
    this.selectedModel = options.selectedModel || '';
    if (options.placeholder) {
      this.placeholder = options.placeholder;
    }

    // Initialize bound handlers
    this.boundOnDocPointerDown = this.onDocPointerDown.bind(this);
    this.boundOnWindowResize = this.updatePopoverPosition.bind(this);
    this.boundOnTriggerClick = this.onTriggerClick.bind(this);
    this.boundOnTriggerKeyDown = this.onTriggerKeyDown.bind(this);
    this.boundOnSearchKeyDown = this.onSearchKeyDown.bind(this);
    this.boundOnSearchInput = this.onSearchInput.bind(this);
    this.boundOnClearClick = this.onClearClick.bind(this);

    this.buildTrigger();
    this.buildPopover();
    this.updateTriggerText();
  }

  private buildTrigger(): void {
    this.triggerEl = this.containerEl.createEl('div', {
      cls: 'harness-model-select-trigger',
    });

    this.triggerEl.setAttribute('role', 'combobox');
    this.triggerEl.setAttribute('aria-haspopup', 'listbox');
    this.triggerEl.setAttribute('aria-expanded', 'false');
    this.triggerEl.setAttribute('aria-label', 'Select active model');
    this.triggerEl.setAttribute('tabindex', '0');

    this.modelIconEl = this.triggerEl.createEl('span', {
      cls: 'harness-model-select-model-icon',
    });
    setIcon(this.modelIconEl, 'cpu');

    this.labelEl = this.triggerEl.createEl('span', {
      cls: 'harness-model-select-label',
    });

    this.iconSpanEl = this.triggerEl.createEl('span', {
      cls: 'harness-model-select-icon',
    });
    setIcon(this.iconSpanEl, 'chevron-down');

    this.triggerEl.addEventListener('click', this.boundOnTriggerClick);
    this.triggerEl.addEventListener('keydown', this.boundOnTriggerKeyDown);
  }

  private buildPopover(): void {
    this.popoverEl = document.body.createEl('div', {
      cls: 'harness-model-select-popover',
    });
    this.popoverEl.style.display = 'none';

    // Search input container
    this.searchContainerEl = this.popoverEl.createEl('div', {
      cls: 'harness-model-search-container',
    });

    const searchIconSpan = this.searchContainerEl.createEl('span', {
      cls: 'harness-model-search-icon',
    });
    setIcon(searchIconSpan, 'search');

    this.searchInputEl = this.searchContainerEl.createEl('input', {
      cls: 'harness-model-search-input',
      type: 'text',
      placeholder: 'Search model...',
    });
    this.searchInputEl.setAttribute('aria-label', 'Search model');
    this.searchInputEl.setAttribute('autocomplete', 'off');
    this.searchInputEl.setAttribute('spellcheck', 'false');

    this.clearBtnEl = this.searchContainerEl.createEl('button', {
      cls: 'harness-search-clear-btn',
      text: '✕',
    });
    this.clearBtnEl.setAttribute('aria-label', 'Clear search');
    this.clearBtnEl.setAttribute('tabindex', '-1');
    this.clearBtnEl.style.display = 'none';

    // Options list container
    this.optionsListEl = this.popoverEl.createEl('div', {
      cls: 'harness-model-options-list',
    });
    this.optionsListEl.setAttribute('role', 'listbox');
    this.optionsListEl.setAttribute('aria-label', 'Models list');

    // Attach search input listeners
    this.searchInputEl.addEventListener('input', this.boundOnSearchInput);
    this.searchInputEl.addEventListener('keydown', this.boundOnSearchKeyDown);
    this.clearBtnEl.addEventListener('click', this.boundOnClearClick);
  }

  private updateTriggerText(): void {
    if (this.selectedModel) {
      this.labelEl.setText(this.selectedModel);
      this.labelEl.removeClass('is-placeholder');
      const lower = this.selectedModel.toLowerCase();
      if (this.modelIconEl) {
        if (lower.includes('deepseek')) {
          setIcon(this.modelIconEl, 'zap');
        } else if (lower.includes('claude') || lower.includes('anthropic')) {
          setIcon(this.modelIconEl, 'sparkles');
        } else if (lower.includes('gpt') || lower.includes('openai') || lower.includes('o1') || lower.includes('o3')) {
          setIcon(this.modelIconEl, 'bot');
        } else if (lower.includes('gemini') || lower.includes('google')) {
          setIcon(this.modelIconEl, 'sparkles');
        } else if (lower.includes('llama') || lower.includes('meta')) {
          setIcon(this.modelIconEl, 'terminal');
        } else {
          setIcon(this.modelIconEl, 'cpu');
        }
      }
    } else {
      this.labelEl.setText(this.placeholder);
      this.labelEl.addClass('is-placeholder');
      if (this.modelIconEl) {
        setIcon(this.modelIconEl, 'cpu');
      }
    }
  }

  private onTriggerClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  private onTriggerKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      this.open();
    }
  }

  private onSearchInput(e: Event): void {
    this.searchQuery = this.searchInputEl.value;
    this.clearBtnEl.style.display = this.searchQuery ? 'inline-flex' : 'none';
    this.highlightedIndex = -1;
    this.renderOptions();
  }

  private onClearClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.searchQuery = '';
    this.searchInputEl.value = '';
    this.clearBtnEl.style.display = 'none';
    this.highlightedIndex = -1;
    this.renderOptions();
    this.searchInputEl.focus();
  }

  private onSearchKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.filteredModels.length > 0) {
        const nextIndex =
          this.highlightedIndex === -1
            ? 0
            : (this.highlightedIndex + 1) % this.filteredModels.length;
        this.setHighlightedIndex(nextIndex, true);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.filteredModels.length > 0) {
        const prevIndex =
          this.highlightedIndex <= 0
            ? this.filteredModels.length - 1
            : this.highlightedIndex - 1;
        this.setHighlightedIndex(prevIndex, true);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredModels.length) {
        this.selectModel(this.filteredModels[this.highlightedIndex]);
      } else if (this.filteredModels.length === 1) {
        this.selectModel(this.filteredModels[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      this.triggerEl.focus();
    } else if (e.key === 'Tab') {
      this.close();
    }
  }

  private highlightMatches(containerEl: HTMLElement, text: string, query: string): void {
    if (!query) {
      containerEl.setText(text);
      return;
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let startIndex = 0;
    let matchIndex = lowerText.indexOf(lowerQuery, startIndex);

    if (matchIndex === -1) {
      containerEl.setText(text);
      return;
    }

    while (matchIndex !== -1) {
      if (matchIndex > startIndex) {
        containerEl.createSpan({ text: text.substring(startIndex, matchIndex) });
      }
      const matchEnd = matchIndex + lowerQuery.length;
      containerEl.createEl('mark', {
        cls: 'harness-search-highlight',
        text: text.substring(matchIndex, matchEnd),
      });
      startIndex = matchEnd;
      matchIndex = lowerText.indexOf(lowerQuery, startIndex);
    }

    if (startIndex < text.length) {
      containerEl.createSpan({ text: text.substring(startIndex) });
    }
  }

  private renderOptions(): void {
    this.optionsListEl.empty();

    const query = this.searchQuery.trim().toLowerCase();
    this.filteredModels = this.models.filter((m) =>
      m.toLowerCase().includes(query)
    );

    if (this.filteredModels.length === 0) {
      const emptyEl = this.optionsListEl.createEl('div', {
        cls: 'harness-model-empty',
      });
      if (this.searchQuery.trim()) {
        emptyEl.setText(`No models found matching "${this.searchQuery.trim()}"`);
      } else {
        emptyEl.setText('No models available');
      }
      this.highlightedIndex = -1;
      return;
    }

    // Default highlight to currently selected model if visible, else index 0
    if (this.highlightedIndex < 0 || this.highlightedIndex >= this.filteredModels.length) {
      const selectedIdx = this.filteredModels.indexOf(this.selectedModel);
      this.highlightedIndex = selectedIdx >= 0 ? selectedIdx : 0;
    }

    for (let i = 0; i < this.filteredModels.length; i++) {
      const model = this.filteredModels[i];
      const isSelected = model === this.selectedModel;
      const isHighlighted = i === this.highlightedIndex;

      const optionEl = this.optionsListEl.createEl('div', {
        cls: 'harness-model-option',
      });
      optionEl.setAttribute('role', 'option');
      optionEl.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      optionEl.setAttribute('data-model', model);
      optionEl.setAttribute('data-index', String(i));

      if (isSelected) {
        optionEl.addClass('is-selected');
      }
      if (isHighlighted) {
        optionEl.addClass('is-highlighted');
      }

      const textSpan = optionEl.createEl('span', {
        cls: 'harness-model-option-text',
      });
      this.highlightMatches(textSpan, model, this.searchQuery.trim());

      const checkIconSpan = optionEl.createEl('span', {
        cls: 'harness-model-check-icon',
      });
      if (isSelected) {
        setIcon(checkIconSpan, 'check');
      }

      optionEl.addEventListener('mouseenter', () => {
        this.setHighlightedIndex(i, false);
      });

      optionEl.addEventListener('mousedown', (e) => {
        // Prevent search input from losing focus before click completes
        e.preventDefault();
      });

      optionEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectModel(model);
      });
    }
  }

  private setHighlightedIndex(index: number, scrollIntoView: boolean = false): void {
    if (this.filteredModels.length === 0) {
      this.highlightedIndex = -1;
      return;
    }

    this.highlightedIndex = Math.max(0, Math.min(index, this.filteredModels.length - 1));
    const optionEls = this.optionsListEl.querySelectorAll<HTMLElement>('.harness-model-option');
    optionEls.forEach((opt, i) => {
      if (i === this.highlightedIndex) {
        opt.addClass('is-highlighted');
        if (scrollIntoView) {
          opt.scrollIntoView({ block: 'nearest' });
        }
      } else {
        opt.removeClass('is-highlighted');
      }
    });
  }

  private updatePopoverPosition(): void {
    if (!this.isOpen) return;

    const rect = this.triggerEl.getBoundingClientRect();
    const popoverWidth = Math.max(rect.width, 240);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = rect.left;
    if (left + popoverWidth > viewportWidth - 8) {
      left = Math.max(8, viewportWidth - popoverWidth - 8);
    }
    if (left < 8) left = 8;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    this.popoverEl.style.position = 'fixed';
    this.popoverEl.style.left = `${left}px`;
    this.popoverEl.style.width = `${popoverWidth}px`;
    this.popoverEl.style.zIndex = '9999';

    // If there is not enough space below (< 220px) and more space above, open upwards
    if (spaceBelow < 220 && spaceAbove > spaceBelow) {
      this.popoverEl.style.top = 'auto';
      this.popoverEl.style.bottom = `${viewportHeight - rect.top + 4}px`;
    } else {
      this.popoverEl.style.top = `${rect.bottom + 4}px`;
      this.popoverEl.style.bottom = 'auto';
    }
  }

  private onDocPointerDown(e: PointerEvent): void {
    if (!this.isOpen) return;
    const target = e.target as Node;
    if (this.popoverEl.contains(target) || this.triggerEl.contains(target)) {
      return;
    }
    this.close();
  }

  private async selectModel(model: string): Promise<void> {
    this.setValue(model);
    this.close();
    this.triggerEl.focus();

    if (this.options.onChange) {
      try {
        await this.options.onChange(model);
      } catch (err) {
        console.error('Error in SearchableModelSelect onChange callback:', err);
      }
    }
  }

  public open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.triggerEl.setAttribute('aria-expanded', 'true');
    this.triggerEl.addClass('is-open');

    this.searchQuery = '';
    this.searchInputEl.value = '';
    this.clearBtnEl.style.display = 'none';

    this.renderOptions();

    this.popoverEl.style.display = 'flex';
    this.updatePopoverPosition();

    // Scroll to highlighted option
    if (this.highlightedIndex >= 0) {
      const activeOpt = this.optionsListEl.querySelector<HTMLElement>('.is-highlighted');
      if (activeOpt) {
        activeOpt.scrollIntoView({ block: 'nearest' });
      }
    }

    setTimeout(() => {
      this.searchInputEl.focus();
      this.searchInputEl.select();
    }, 0);

    document.addEventListener('pointerdown', this.boundOnDocPointerDown, true);
    window.addEventListener('resize', this.boundOnWindowResize);
    window.addEventListener('scroll', this.boundOnWindowResize, true);
  }

  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.triggerEl.setAttribute('aria-expanded', 'false');
    this.triggerEl.removeClass('is-open');
    this.popoverEl.style.display = 'none';

    document.removeEventListener('pointerdown', this.boundOnDocPointerDown, true);
    window.removeEventListener('resize', this.boundOnWindowResize);
    window.removeEventListener('scroll', this.boundOnWindowResize, true);
  }

  public setModels(models: string[], selectedModel?: string): void {
    this.models = [...models];
    if (selectedModel !== undefined) {
      this.selectedModel = selectedModel;
    } else if (!this.models.includes(this.selectedModel)) {
      this.selectedModel = this.models[0] || '';
    }
    this.updateTriggerText();
    if (this.isOpen) {
      this.renderOptions();
      this.updatePopoverPosition();
    }
  }

  public setValue(model: string): void {
    this.selectedModel = model;
    this.updateTriggerText();
    if (this.isOpen) {
      this.renderOptions();
    }
  }

  public getValue(): string {
    return this.selectedModel;
  }

  public destroy(): void {
    this.close();
    this.triggerEl.removeEventListener('click', this.boundOnTriggerClick);
    this.triggerEl.removeEventListener('keydown', this.boundOnTriggerKeyDown);
    this.searchInputEl.removeEventListener('input', this.boundOnSearchInput);
    this.searchInputEl.removeEventListener('keydown', this.boundOnSearchKeyDown);
    this.clearBtnEl.removeEventListener('click', this.boundOnClearClick);
    this.triggerEl.remove();
    this.popoverEl.remove();
  }
}
