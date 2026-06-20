/*
 
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.melviz.displayer;

import static java.util.stream.Collectors.groupingBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.melviz.dataset.DataSetLookup;
import org.melviz.dataset.DataSetOp;
import org.melviz.dataset.DataSetOpType;

public interface GlobalDisplayerSettings {

    void setDisplayerSettings(DisplayerSettings settings);

    default Optional<DisplayerSettings> getSettings() {
        return Optional.empty();
    }

    default void apply(DisplayerSettings settings) {
        getSettings().ifPresent(globalSettings -> {
            var globalLookup = globalSettings.getDataSetLookup();
            var lookup = settings.getDataSetLookup();
            // Copy Settings
            globalSettings.getSettingsFlatMap().forEach((k, v) -> {
                if (!settings.getSettingsFlatMap().containsKey(k)) {
                    settings.setDisplayerSetting(k, v);
                }
            });

            if (globalSettings.getDataSet() != null && settings.getDataSet() == null) {
                settings.setDataSet(globalSettings.getDataSet());
            }

            // Copy Lookup
            if (globalLookup != null) {
                if (lookup == null) {
                    settings.setDataSetLookup(globalLookup.cloneInstance());
                } else {
                    if (lookup.getDataSetUUID() == null) {
                        lookup.setDataSetUUID(globalLookup.getDataSetUUID());
                    }
                    if (lookup.getRowOffset() == 0) {
                        lookup.setRowOffset(globalLookup.getRowOffset());
                    }
                    if (lookup.getNumberOfRows() == -1) {
                        lookup.setNumberOfRows(globalLookup.getNumberOfRows());
                    }
                    copyOperations(globalLookup, lookup);
                }
            }

            globalSettings.getColumnSettingsList().forEach(globalClSettings -> {
                var containsCL = settings.getColumnSettingsList()
                        .stream()
                        .map(ColumnSettings::getColumnId)
                        .filter(s -> s.equals(globalClSettings.getColumnId()))
                        .findAny()
                        .isPresent();
                if (!containsCL) {
                    settings.getColumnSettingsList().add(globalClSettings.cloneInstance());
                }
            });

        });
    }

    default void copyOperations(DataSetLookup globalLookup, DataSetLookup lookup) {
        // Operations can't be overriden, but the global operation should come first
        // the order (0..N) FILTER > (0..N) GROUP > (0..1) SORT should be respected

        var globalOperationsMap = collectOperations(globalLookup);
        var localOperationsMap = collectOperations(lookup);

        var finalOperations = new ArrayList<DataSetOp>();

        List.of(DataSetOpType.FILTER,
                DataSetOpType.GROUP)
                .forEach(type -> {
                    globalOperationsMap.getOrDefault(type, List.of())
                            .forEach(finalOperations::add);
                    localOperationsMap.getOrDefault(type, List.of())
                            .forEach(finalOperations::add);
                });
        localOperationsMap.getOrDefault(DataSetOpType.SORT,
                globalOperationsMap.getOrDefault(DataSetOpType.SORT,
                        List.of()))
                .forEach(finalOperations::add);
        lookup.getOperationList().clear();
        lookup.getOperationList().addAll(finalOperations);
    }

    default Map<DataSetOpType, List<DataSetOp>> collectOperations(DataSetLookup lookup) {
        return lookup.getOperationList()
                .stream()
                .collect(groupingBy(v -> v.getType()));
    }
}
